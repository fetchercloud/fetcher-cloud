// src/lib/net.js — shared helpers for the fetch-based tools.

export const UA = "Mozilla/5.0 (compatible; fetcher.cloud/1.0; +https://fetcher.cloud/bot)";

/** Normalise a URL or bare hostname to a full http(s) URL string. */
export function normalizeUrl(raw) {
  const t = (raw || "").trim();
  if (!t) throw new Error("missing_url");
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  let u;
  try { u = new URL(withScheme); } catch { throw new Error("invalid_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid_url");
  return u.toString();
}

/** Extract a bare hostname from a URL or hostname input. */
export function normalizeHost(raw) {
  const t = (raw || "").trim();
  if (!t) throw new Error("missing_host");
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.toLowerCase();
  } catch { throw new Error("invalid_host"); }
}

/** fetch() with an abort timeout and our UA. Throws "timeout"/"fetch_failed". */
export async function timedFetch(url, opts = {}, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      ...opts,
      headers: { "User-Agent": UA, ...(opts.headers || {}) },
    });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "timeout" : "fetch_failed");
  } finally {
    clearTimeout(timer);
  }
}
