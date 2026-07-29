// src/lib/rdap.js
//
// Pure domain-availability lookup logic. No Express, no x402, no payment
// awareness in here on purpose — this file should work identically whether
// it's called from a paid route, a free route, a cron job, or a test script.
// Keeping business logic separate from the payment gate is what lets us
// bolt on a second payment method (Stripe, API keys, whatever) later
// without touching this file.

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const DEFAULT_TLDS = ["com", "net", "org", "io", "dev", "ai", "app", "co"];

let bootstrapCache = null;
let bootstrapCacheAt = 0;
const BOOTSTRAP_TTL_MS = 1000 * 60 * 60 * 12; // 12h — IANA's map rarely changes

/**
 * Load (and cache) the IANA RDAP bootstrap file, which maps each TLD to the
 * list of RDAP base URLs that serve records for it.
 */
async function getBootstrap() {
  const now = Date.now();
  if (bootstrapCache && now - bootstrapCacheAt < BOOTSTRAP_TTL_MS) {
    return bootstrapCache;
  }

  const res = await fetch(IANA_BOOTSTRAP_URL);
  if (!res.ok) {
    throw new Error(`IANA bootstrap fetch failed: ${res.status}`);
  }
  const data = await res.json();

  // data.services is an array of [ [tlds...], [rdapBaseUrls...] ]
  const map = new Map();
  for (const [tlds, urls] of data.services) {
    for (const tld of tlds) {
      map.set(tld.toLowerCase(), urls);
    }
  }

  bootstrapCache = map;
  bootstrapCacheAt = now;
  return map;
}

/**
 * Look up a single "label.tld" via RDAP.
 * Returns a normalized result object — never throws for "domain taken" or
 * "domain available", only for actual transport/config errors.
 */
async function lookupOne(label, tld) {
  const domain = `${label}.${tld}`.toLowerCase();

  let bootstrap;
  try {
    bootstrap = await getBootstrap();
  } catch (err) {
    return {
      domain,
      available: null,
      status: "error",
      error: `bootstrap_unavailable: ${err.message}`,
      summary: `Couldn't check ${domain} — IANA lookup failed.`,
    };
  }

  const bases = bootstrap.get(tld.toLowerCase());
  if (!bases || bases.length === 0) {
    return {
      domain,
      available: null,
      status: "unsupported_tld",
      note: "No RDAP server known for this TLD via IANA bootstrap. Consider a registrar API fallback.",
      summary: `${domain} can't be checked — .${tld} doesn't have a public RDAP server.`,
    };
  }

  const base = bases[0].endsWith("/") ? bases[0] : bases[0] + "/";
  const url = `${base}domain/${domain}`;

  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/rdap+json" } });
  } catch (err) {
    return {
      domain,
      available: null,
      status: "error",
      error: `rdap_request_failed: ${err.message}`,
      summary: `Couldn't check ${domain} — network error reaching the registry.`,
    };
  }

  // RDAP servers return 404 for domains with no record -> available.
  if (res.status === 404) {
    return {
      domain,
      available: true,
      status: "available",
      summary: `${domain} is available.`,
    };
  }

  if (!res.ok) {
    return {
      domain,
      available: null,
      status: "error",
      error: `rdap_status_${res.status}`,
      summary: `Couldn't check ${domain} (RDAP returned ${res.status}).`,
    };
  }

  const record = await res.json();

  const events = record.events || [];
  const registration = events.find((e) => e.eventAction === "registration");
  const expiration = events.find((e) => e.eventAction === "expiration");

  const statuses = (record.status || []).map((s) => s.toLowerCase());
  const isPendingDelete =
    statuses.includes("pending delete") || statuses.includes("redemption period");

  const registrarEntity = (record.entities || []).find((e) =>
    (e.roles || []).includes("registrar")
  );
  const registrarName =
    registrarEntity?.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3] ?? null;

  const expiryDate = expiration?.eventDate
    ? new Date(expiration.eventDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const summary = isPendingDelete
    ? `${domain} recently expired and is in a redemption window — it may become available soon.`
    : `${domain} is taken${registrarName ? ` (registered via ${registrarName}` : ""}${
        expiryDate ? `, expires ${expiryDate})` : registrarName ? ")" : ""
      }.`;

  return {
    domain,
    available: false,
    registrar: registrarName,
    created: registration?.eventDate ?? null,
    expires: expiration?.eventDate ?? null,
    status: isPendingDelete ? "pending_delete" : "active",
    note: isPendingDelete
      ? "Expired, in redemption/pending-delete window — may become available soon"
      : undefined,
    summary,
  };
}

/**
 * Look up a label across multiple TLDs in parallel.
 * @param {string} name - domain label without TLD, e.g. "fetcher"
 * @param {string[]} [tlds] - list of TLDs to check
 */
export async function checkDomain(name, tlds = DEFAULT_TLDS) {
  const label = name.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!label || /[^a-z0-9-]/i.test(label)) {
    throw new Error("invalid_domain_label");
  }

  const results = await Promise.all(tlds.map((tld) => lookupOne(label, tld)));

  return {
    query: label,
    checked_at: new Date().toISOString(),
    results,
    source: "RDAP",
  };
}

/**
 * Full registration record for one domain (the /whois tool). Reuses the same
 * IANA bootstrap + RDAP path as availability, but returns the complete parsed
 * record: registrar, all dates, statuses, nameservers, DNSSEC, and whatever
 * contact info the registry exposes (often redacted for privacy).
 */
export async function lookupRegistration(rawDomain) {
  const domain = (rawDomain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain || !domain.includes(".") || /\s/.test(domain)) throw new Error("invalid_domain");

  const tld = domain.split(".").pop();
  const bootstrap = await getBootstrap();
  const bases = bootstrap.get(tld);
  if (!bases || bases.length === 0) {
    return { domain, registered: null, status: "unsupported_tld", source: "RDAP",
      summary: `.${tld} has no public RDAP server; can't fetch registration.` };
  }

  const base = bases[0].endsWith("/") ? bases[0] : bases[0] + "/";
  const res = await fetch(`${base}domain/${domain}`, { headers: { Accept: "application/rdap+json" } });

  if (res.status === 404) {
    return { domain, registered: false, status: "available", source: "RDAP",
      summary: `${domain} is not registered (available).` };
  }
  if (!res.ok) { const e = new Error("rdap_status"); e.status = res.status; throw e; }

  const r = await res.json();
  const events = r.events || [];
  const dateOf = (a) => events.find((e) => e.eventAction === a)?.eventDate ?? null;
  const entities = r.entities || [];
  const entityByRole = (role) => entities.find((e) => (e.roles || []).includes(role));
  const nameOf = (ent) => ent?.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3] ?? null;

  const nameservers = (r.nameservers || []).map((n) => (n.ldhName || "").toLowerCase()).filter(Boolean);
  const statuses = r.status || [];

  return {
    domain,
    registered: true,
    status: statuses.map((s) => s.toLowerCase()).some((s) => s.includes("pending delete") || s.includes("redemption")) ? "pending_delete" : "active",
    checked_at: new Date().toISOString(),
    registrar: nameOf(entityByRole("registrar")),
    registrant: nameOf(entityByRole("registrant")),
    dates: { created: dateOf("registration"), updated: dateOf("last changed"), expires: dateOf("expiration") },
    nameservers,
    statuses,
    dnssec: !!(r.secureDNS && r.secureDNS.delegationSigned),
    source: "RDAP",
    summary: `${domain}: registered${nameOf(entityByRole("registrar")) ? ` via ${nameOf(entityByRole("registrar"))}` : ""}${dateOf("expiration") ? `, expires ${new Date(dateOf("expiration")).toISOString().slice(0,10)}` : ""}.`,
  };
}

export { DEFAULT_TLDS };
