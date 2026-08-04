// src/lib/headers.js — HTTP headers + security-header analysis.
import { normalizeUrl, timedFetch } from "./net.js";

const SECURITY = {
  "strict-transport-security": "HSTS (forces HTTPS)",
  "content-security-policy": "CSP (limits resource origins)",
  "x-frame-options": "Clickjacking protection",
  "x-content-type-options": "MIME-sniffing protection",
  "referrer-policy": "Referrer control",
  "permissions-policy": "Feature/permissions control",
};

export async function inspectHeaders(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const res = await timedFetch(url, { redirect: "follow" }, 8000);

  const headers = {};
  for (const [k, v] of res.headers.entries()) headers[k] = v;

  const present = [], missing = [];
  for (const [h, desc] of Object.entries(SECURITY)) {
    (headers[h] ? present : missing).push({ header: h, note: desc });
  }
  const score = Math.round((present.length / Object.keys(SECURITY).length) * 100);

  return {
    query: url,
    final_url: res.url || url,
    status: res.status,
    checked_at: new Date().toISOString(),
    server: headers["server"] || null,
    content_type: headers["content-type"] || null,
    headers,
    security: { score, present, missing },
    source: "HTTP header inspection",
    summary: `${res.status} · security headers ${present.length}/${Object.keys(SECURITY).length} present (${score}%).`,
  };
}
