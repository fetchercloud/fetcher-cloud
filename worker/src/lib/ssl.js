// src/lib/ssl.js — TLS certificate details via Certificate Transparency logs.
//
// Workers can't read the live served cert over a raw socket, so this queries
// crt.sh (public CT logs) for the most recent issued certificate — issuer,
// validity window, and SANs. Note: CT shows *issued* certs, which is almost
// always the served one, but isn't a live handshake check.
import { normalizeHost } from "./net.js";

export async function getSsl(rawHost) {
  const host = normalizeHost(rawHost);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  let rows;
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "fetcher.cloud/1.0" },
    });
    if (!res.ok) throw new Error("ct_unavailable");
    rows = await res.json();
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "timeout" : "ct_unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { host, checked_at: new Date().toISOString(), found: false, source: "crt.sh (CT logs)", summary: `No CT log entries found for ${host}.` };
  }

  // Most recent by not_before.
  rows.sort((a, b) => new Date(b.not_before) - new Date(a.not_before));
  const c = rows[0];
  const sans = [...new Set(String(c.name_value || "").split(/\n/).map((s) => s.trim()).filter(Boolean))];
  const notAfter = new Date(c.not_after);
  const daysLeft = Math.round((notAfter - Date.now()) / 86_400_000);

  return {
    host,
    checked_at: new Date().toISOString(),
    found: true,
    certificate: {
      issuer: c.issuer_name,
      common_name: c.common_name,
      not_before: c.not_before,
      not_after: c.not_after,
      days_until_expiry: daysLeft,
      expired: daysLeft < 0,
      sans,
    },
    recent_cert_count: rows.length,
    source: "crt.sh (Certificate Transparency logs)",
    summary: `${host}: cert by ${shortIssuer(c.issuer_name)}, ${daysLeft < 0 ? "EXPIRED" : `expires in ${daysLeft} days`} (${sans.length} name[s]).`,
  };
}

function shortIssuer(s) { const m = /O=([^,]+)/.exec(s || ""); return m ? m[1] : (s || "unknown").slice(0, 40); }
