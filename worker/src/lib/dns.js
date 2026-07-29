// src/lib/dns.js — DNS-over-HTTPS lookups (Cloudflare DoH).

const DOH = "https://cloudflare-dns.com/dns-query";
const TYPE_NUM = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257 };

export async function dohQuery(name, type) {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.Answer)) return [];
    const want = TYPE_NUM[type];
    return data.Answer.filter((a) => a.type === want).map((a) => a.data);
  } catch {
    return [];
  }
}

const strip = (arr) => arr.map((t) => t.replace(/^"|"$/g, ""));

/** Full record dump for a hostname. */
export async function getAllDnsRecords(host) {
  const [a, aaaa, mx, ns, txt, soa, caa, cname] = await Promise.all([
    dohQuery(host, "A"), dohQuery(host, "AAAA"), dohQuery(host, "MX"),
    dohQuery(host, "NS"), dohQuery(host, "TXT"), dohQuery(host, "SOA"),
    dohQuery(host, "CAA"), dohQuery(host, "CNAME"),
  ]);
  const txtc = strip(txt);
  return {
    host,
    checked_at: new Date().toISOString(),
    records: { A: a, AAAA: aaaa, MX: mx, NS: ns, TXT: txtc, SOA: soa, CAA: strip(caa), CNAME: cname },
    signals: {
      resolves: a.length > 0 || aaaa.length > 0,
      has_mail: mx.length > 0,
      has_spf: txtc.some((t) => /^v=spf1/i.test(t)),
      dnssec_caa: caa.length > 0,
    },
    source: "Cloudflare DNS-over-HTTPS",
    summary: `${host}: ${a.length} A, ${aaaa.length} AAAA, ${mx.length} MX, ${ns.length} NS, ${txtc.length} TXT record(s).`,
  };
}
