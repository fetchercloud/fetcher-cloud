// src/lib/enrich.js
//
// Optional enrichment for domain lookups. Everything here is free to run
// (no paid data partners): DNS-over-HTTPS via Cloudflare, page history via
// the Internet Archive, and domain age computed from data we already have.
//
// Kept deliberately separate from rdap.js so the base availability check
// stays fast and dependency-free. Enrichment is opt-in — only the
// /domain/enriched route calls into this file.
//
// Design note on what's NOT here: aftermarket sale price (Sedo/Afternic/
// GoDaddy) and trademark-conflict risk both require paid API relationships
// and have no reliable free source. Rather than ship a fabricated or
// misleading number on data someone might make a purchase decision on,
// those are left as a documented v2 once a marketplace/legal API is wired
// in. See README.

const DOH_URL = "https://cloudflare-dns.com/dns-query";
const WAYBACK_AVAILABLE = "https://archive.org/wayback/available";
const WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx";

// DNS record type numbers as returned by DoH JSON.
const DNS_TYPES = { A: 1, NS: 2, TXT: 16, AAAA: 28, MX: 15 };

/**
 * Query a single DNS record type via Cloudflare DNS-over-HTTPS.
 * Returns an array of answer `data` strings (empty array on no records or
 * any error — enrichment must never break the base result).
 */
async function dohQuery(name, type) {
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.Answer)) return [];
    const wanted = DNS_TYPES[type];
    return data.Answer.filter((a) => a.type === wanted).map((a) => a.data);
  } catch {
    return [];
  }
}

/**
 * Fetch the DNS picture for a domain: whether it resolves to a live host,
 * whether mail is configured, its nameservers, and any TXT records.
 */
export async function getDnsRecords(domain) {
  const [a, aaaa, mx, ns, txt] = await Promise.all([
    dohQuery(domain, "A"),
    dohQuery(domain, "AAAA"),
    dohQuery(domain, "MX"),
    dohQuery(domain, "NS"),
    dohQuery(domain, "TXT"),
  ]);

  // TXT answers arrive wrapped in quotes from DoH; strip them for readability.
  const txtClean = txt.map((t) => t.replace(/^"|"$/g, ""));

  return {
    has_website: a.length > 0 || aaaa.length > 0,
    has_mail: mx.length > 0,
    a,
    aaaa,
    mx,
    nameservers: ns,
    txt: txtClean,
    // A quick, commonly-wanted signal: is email anti-spoofing set up?
    has_spf: txtClean.some((t) => /^v=spf1/i.test(t)),
    has_dmarc: false, // set below via a dedicated _dmarc lookup
  };
}

/**
 * DMARC lives at _dmarc.<domain> as a TXT record, so it needs its own
 * lookup. Cheap and a genuinely useful trust signal, so worth the call.
 */
async function getDmarc(domain) {
  const txt = await dohQuery(`_dmarc.${domain}`, "TXT");
  return txt.map((t) => t.replace(/^"|"$/g, "")).some((t) => /^v=DMARC1/i.test(t));
}

/**
 * Internet Archive history. Two cheap calls:
 *  - the availability API for the closest snapshot (proves it was ever a
 *    real, crawled site), and
 *  - one CDX call sorted oldest-first for the first-ever snapshot date,
 *    which is a good "how long has this been a real site" signal.
 * Degrades gracefully to { archived: false } on any failure.
 */
export async function getWaybackHistory(domain) {
  const result = { archived: false, first_snapshot: null, closest_snapshot: null };

  try {
    const res = await fetch(
      `${WAYBACK_AVAILABLE}?url=${encodeURIComponent(domain)}`,
      { headers: { Accept: "application/json" } }
    );
    if (res.ok) {
      const data = await res.json();
      const closest = data?.archived_snapshots?.closest;
      if (closest?.available) {
        result.archived = true;
        result.closest_snapshot = {
          url: closest.url,
          timestamp: waybackTimestampToISO(closest.timestamp),
        };
      }
    }
  } catch {
    /* leave archived=false */
  }

  // First-ever snapshot via CDX (oldest first, single row).
  try {
    const cdxUrl =
      `${WAYBACK_CDX}?url=${encodeURIComponent(domain)}` +
      `&output=json&fl=timestamp&limit=1`;
    const res = await fetch(cdxUrl);
    if (res.ok) {
      const rows = await res.json();
      // rows[0] is a header row (["timestamp"]); rows[1] is the first record.
      if (Array.isArray(rows) && rows.length > 1 && rows[1]?.[0]) {
        result.archived = true;
        result.first_snapshot = waybackTimestampToISO(rows[1][0]);
      }
    }
  } catch {
    /* keep whatever the availability call gave us */
  }

  return result;
}

/** Wayback timestamps look like 20140203193045 -> ISO date string. */
function waybackTimestampToISO(ts) {
  if (!ts || ts.length < 8) return null;
  const y = ts.slice(0, 4);
  const mo = ts.slice(4, 6);
  const d = ts.slice(6, 8);
  return `${y}-${mo}-${d}`;
}

/**
 * Domain age from the RDAP registration date we already fetched. Pure
 * arithmetic, no network call.
 */
export function computeDomainAge(createdISO) {
  if (!createdISO) return null;
  const created = new Date(createdISO);
  if (isNaN(created.getTime())) return null;

  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
  const years = +(days / 365.25).toFixed(1);

  return {
    created: createdISO,
    created_readable: created.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    age_days: days,
    age_years: years,
  };
}

/**
 * Enrich a single result object from checkDomain(). Chooses what to fetch
 * based on the domain's state:
 *   - taken/active/pending-delete -> DNS + age + history
 *   - available                   -> history only (a dropped domain with
 *                                     real archive history is exactly what
 *                                     a buyer wants to know)
 *   - error/unsupported           -> left untouched
 * Returns the same object with an `enrichment` sub-object added.
 */
export async function enrichDomainResult(result) {
  const isTaken = result.available === false;
  const isAvailable = result.available === true;

  if (!isTaken && !isAvailable) {
    return result; // error / unsupported_tld — nothing meaningful to add
  }

  if (isAvailable) {
    // No live DNS or registration date to speak of; history still matters.
    const history = await getWaybackHistory(result.domain);
    return {
      ...result,
      enrichment: {
        previously_used: history.archived,
        history,
      },
    };
  }

  // Taken: run everything in parallel.
  const [dns, dmarc, history] = await Promise.all([
    getDnsRecords(result.domain),
    getDmarc(result.domain),
    getWaybackHistory(result.domain),
  ]);
  dns.has_dmarc = dmarc;

  const age = computeDomainAge(result.created);

  return {
    ...result,
    enrichment: {
      age,
      dns,
      history,
      // A compact, human-oriented read of the signals above.
      site_status: dns.has_website
        ? "live website resolving"
        : "registered but not resolving to a website",
    },
  };
}

/**
 * Enrich a full checkDomain() result set (all TLDs in parallel).
 */
export async function enrichResults(result) {
  const enriched = await Promise.all(result.results.map(enrichDomainResult));
  return { ...result, results: enriched, enriched: true };
}
