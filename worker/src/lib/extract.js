// src/lib/extract.js
//
// Clean content extraction — "readability as a service." Fetches a URL and
// returns the main article content as clean Markdown + plain text, stripped
// of nav, ads, and boilerplate, plus structured metadata, headings, links,
// and reading-time stats. Built for RAG / agent ingestion, where handing a
// model a full raw HTML page wastes tokens and buries the signal.
//
// Static fetch + parse only. For JavaScript-rendered pages (SPAs), call
// /render first, then feed the rendered HTML here — or use ?via_render=true
// once the Browser Rendering binding is enabled (see README).
//
// Future mode: OCR extraction from image/PDF URLs. That needs an OCR engine
// (Cloudflare Workers AI binding or an external API) — scaffolded as a
// documented v2 rather than shipped half-working. See README.

import { parseMetadata, extractReadable } from "./html.js";

const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES = 2_000_000; // don't try to parse enormous pages

function normalizeInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) throw new Error("missing_url");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error("invalid_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid_url");
  return u.toString();
}

/**
 * Extract readable content from a URL.
 * @param {string} rawUrl
 * @param {object} [opts]
 * @param {"markdown"|"text"|"full"} [opts.mode="full"] - what to include
 */
export async function extractContent(rawUrl, opts = {}) {
  const mode = opts.mode || "full";
  const url = normalizeInput(rawUrl);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; fetcher.cloud/1.0; +https://fetcher.cloud/bot)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(err.name === "AbortError" ? "timeout" : "fetch_failed");
  }
  clearTimeout(timer);

  const finalUrl = res.url || url;
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    const e = new Error("upstream_status");
    e.status = res.status;
    throw e;
  }

  if (!contentType.includes("text/html") && !contentType.includes("xml")) {
    const e = new Error("unsupported_content_type");
    e.contentType = contentType;
    throw e;
  }

  const raw = await res.text();
  const html = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw;

  const metadata = parseMetadata(html, finalUrl);
  const readable = extractReadable(html, finalUrl);

  const base = {
    query: url,
    final_url: finalUrl,
    extracted_at: new Date().toISOString(),
    title: metadata.title,
    metadata,
    word_count: readable.word_count,
    reading_time_min: readable.reading_time_min,
    source: "static HTML extraction",
    summary: `Extracted ${readable.word_count} words${
      metadata.title ? ` from "${metadata.title}"` : ""
    } (${readable.reading_time_min} min read).`,
  };

  if (mode === "markdown") return { ...base, markdown: readable.markdown };
  if (mode === "text") return { ...base, text: readable.text };

  return {
    ...base,
    markdown: readable.markdown,
    text: readable.text,
    headings: readable.headings,
    links: readable.links,
    images: readable.images,
  };
}
