// src/lib/unfurl.js — link preview (OG/Twitter card) for any URL.
import { normalizeUrl, timedFetch } from "./net.js";
import { parseMetadata } from "./html.js";

export async function unfurl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const res = await timedFetch(url, { redirect: "follow", headers: { Accept: "text/html,*/*" } }, 8000);
  const finalUrl = res.url || url;
  const ct = res.headers.get("content-type") || "";

  if (!res.ok) { const e = new Error("upstream_status"); e.status = res.status; throw e; }
  if (!ct.includes("text/html") && !ct.includes("xml")) {
    return {
      query: url, final_url: finalUrl, content_type: ct,
      card: { title: finalUrl.split("/").pop() || finalUrl, type: ct.split(";")[0] },
      source: "unfurl", summary: `${finalUrl} is a ${ct.split(";")[0]} resource (no preview card).`,
    };
  }

  const html = (await res.text()).slice(0, 500_000);
  const m = parseMetadata(html, finalUrl);
  return {
    query: url,
    final_url: finalUrl,
    checked_at: new Date().toISOString(),
    card: {
      title: m.title, description: m.description, image: m.image,
      site_name: m.site_name, favicon: m.favicon, type: m.type || "website",
      canonical: m.canonical,
    },
    source: "OpenGraph / Twitter card",
    summary: m.title ? `${m.site_name || finalUrl}: "${m.title}"` : `Preview for ${finalUrl}.`,
  };
}
