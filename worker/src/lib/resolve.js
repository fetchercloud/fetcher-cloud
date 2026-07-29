// src/lib/resolve.js
//
// Link / redirect intelligence. Agents get handed shortened, tracking, or
// wrapped URLs (bit.ly, t.co, utm-laden links, marketing redirectors) and
// can't safely see where they actually land without following them. This
// resolves the full HTTP redirect chain, returns the final destination and
// every hop, and enriches the final page with metadata — in one paid call.
//
// Pure fetch + static HTML parse. No JS execution (that's /render's job).

import { parseMetadata } from "./html.js";

const MAX_HOPS = 12;
const FETCH_TIMEOUT_MS = 8000;

function normalizeInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) throw new Error("missing_url");
  // Allow bare hostnames (example.com) by defaulting to https://.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error("invalid_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("invalid_url");
  }
  return u.toString();
}

async function fetchNoRedirect(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: ctrl.signal,
      headers: {
        // Present as a normal browser so redirectors behave as they would
        // for a human, not a bot-blocked variant.
        "User-Agent":
          "Mozilla/5.0 (compatible; fetcher.cloud/1.0; +https://fetcher.cloud/bot)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Follow the redirect chain for a URL and describe where it goes.
 * @param {string} rawUrl
 * @param {object} [opts]
 * @param {boolean} [opts.metadata=true] - fetch final-page metadata
 */
export async function resolveUrl(rawUrl, opts = {}) {
  const withMetadata = opts.metadata !== false;
  const start = normalizeInput(rawUrl);

  const hops = [];
  let current = start;
  let finalResponse = null;

  for (let i = 0; i < MAX_HOPS; i++) {
    let res;
    try {
      res = await fetchNoRedirect(current);
    } catch (err) {
      hops.push({ url: current, status: null, error: err.name === "AbortError" ? "timeout" : "fetch_failed" });
      return buildResult(start, hops, null, null, "unreachable");
    }

    const status = res.status;
    const location = res.headers.get("location");
    const isRedirect = status >= 300 && status < 400 && location;

    hops.push({
      url: current,
      status,
      redirect_to: isRedirect ? absolute(location, current) : undefined,
    });

    if (!isRedirect) {
      finalResponse = res;
      break;
    }

    const next = absolute(location, current);
    if (!next) {
      return buildResult(start, hops, current, null, "bad_redirect_location");
    }
    // Loop guard.
    if (hops.some((h) => h.url === next)) {
      return buildResult(start, hops, next, null, "redirect_loop");
    }
    current = next;
  }

  if (!finalResponse) {
    return buildResult(start, hops, current, null, "too_many_redirects");
  }

  const finalUrl = finalResponse.url || current;
  const contentType = finalResponse.headers.get("content-type") || "";

  let metadata = null;
  if (withMetadata && contentType.includes("text/html")) {
    try {
      const html = await finalResponse.text();
      metadata = parseMetadata(html.slice(0, 500_000), finalUrl); // cap parse size
    } catch {
      metadata = null;
    }
  }

  return buildResult(start, hops, finalUrl, metadata, "ok", contentType);
}

function absolute(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function buildResult(start, hops, finalUrl, metadata, status, contentType) {
  const finalHop = hops[hops.length - 1] || {};
  return {
    query: start,
    resolved_at: new Date().toISOString(),
    status, // ok | unreachable | redirect_loop | too_many_redirects | ...
    final_url: finalUrl,
    final_status: finalHop.status ?? null,
    content_type: contentType || null,
    redirect_count: hops.filter((h) => h.redirect_to).length,
    hops,
    metadata,
    summary: summarize(start, finalUrl, hops, status, metadata),
    source: "HTTP redirect trace",
  };
}

function summarize(start, finalUrl, hops, status, metadata) {
  if (status !== "ok") {
    return `Couldn't fully resolve ${start} (${status.replace(/_/g, " ")}).`;
  }
  const redirects = hops.filter((h) => h.redirect_to).length;
  const dest = metadata?.title ? `"${metadata.title}"` : finalUrl;
  if (redirects === 0) return `${start} resolves directly to ${dest}.`;
  return `${start} redirects ${redirects} time${redirects > 1 ? "s" : ""} and lands on ${dest} (${finalUrl}).`;
}
