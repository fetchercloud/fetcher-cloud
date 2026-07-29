// src/lib/oembed.js — rich embed data for a media URL (YouTube, Vimeo, etc.).
import { normalizeUrl, timedFetch } from "./net.js";
import { parse } from "node-html-parser";

// Fallback provider map for common hosts (used if discovery fails).
const PROVIDERS = [
  { re: /(youtube\.com|youtu\.be)/i, ep: "https://www.youtube.com/oembed" },
  { re: /vimeo\.com/i, ep: "https://vimeo.com/api/oembed.json" },
  { re: /(twitter\.com|x\.com)/i, ep: "https://publish.twitter.com/oembed" },
  { re: /soundcloud\.com/i, ep: "https://soundcloud.com/oembed" },
  { re: /(flickr\.com|flic\.kr)/i, ep: "https://www.flickr.com/services/oembed" },
  { re: /spotify\.com/i, ep: "https://open.spotify.com/oembed" },
  { re: /tiktok\.com/i, ep: "https://www.tiktok.com/oembed" },
];

export async function getOembed(rawUrl) {
  const url = normalizeUrl(rawUrl);

  // 1) Try discovery: fetch page, look for an oEmbed <link>.
  let endpoint = null;
  try {
    const res = await timedFetch(url, { redirect: "follow" }, 7000);
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      const root = parse((await res.text()).slice(0, 200_000), { comment: false });
      const link =
        root.querySelector('link[type="application/json+oembed"]') ||
        root.querySelector('link[type="text/json+oembed"]');
      const href = link?.getAttribute("href");
      if (href) endpoint = href;
    }
  } catch { /* fall through to provider map */ }

  // 2) Fallback: known provider endpoint.
  if (!endpoint) {
    const p = PROVIDERS.find((p) => p.re.test(url));
    if (p) endpoint = `${p.ep}?url=${encodeURIComponent(url)}&format=json`;
  }
  if (!endpoint) throw new Error("no_oembed");

  const oe = await timedFetch(endpoint, { headers: { Accept: "application/json" } }, 7000);
  if (!oe.ok) throw new Error("no_oembed");
  const data = await oe.json();

  return {
    query: url,
    checked_at: new Date().toISOString(),
    oembed: data,
    source: "oEmbed",
    summary: data.title
      ? `${data.provider_name || "Embed"}: "${data.title}"${data.author_name ? ` by ${data.author_name}` : ""}`
      : `oEmbed data for ${url}.`,
  };
}
