// src/lib/feed.js — discover + parse an RSS/Atom feed into clean JSON.
import { normalizeUrl, timedFetch } from "./net.js";
import { XMLParser } from "fast-xml-parser";
import { parse as parseHtml } from "node-html-parser";

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

export async function getFeed(rawUrl, { limit = 20 } = {}) {
  const url = normalizeUrl(rawUrl);
  const res = await timedFetch(url, { redirect: "follow", headers: { Accept: "application/rss+xml, application/atom+xml, text/xml, */*" } }, 8000);
  if (!res.ok) { const e = new Error("upstream_status"); e.status = res.status; throw e; }

  const ct = res.headers.get("content-type") || "";
  let text = await res.text();
  let feedUrl = res.url || url;

  // If we got HTML, discover the feed <link> and fetch it.
  if (ct.includes("html") || /^\s*<!doctype html|<html/i.test(text)) {
    const root = parseHtml(text.slice(0, 200_000), { comment: false });
    const link =
      root.querySelector('link[type="application/rss+xml"]') ||
      root.querySelector('link[type="application/atom+xml"]');
    const href = link?.getAttribute("href");
    if (!href) throw new Error("no_feed");
    feedUrl = new URL(href, feedUrl).toString();
    const fr = await timedFetch(feedUrl, { redirect: "follow" }, 8000);
    if (!fr.ok) throw new Error("no_feed");
    text = await fr.text();
  }

  let doc;
  try { doc = xml.parse(text); } catch { throw new Error("parse_failed"); }

  let title, items;
  if (doc.rss?.channel) {
    title = doc.rss.channel.title;
    items = arr(doc.rss.channel.item).map((it) => ({
      title: str(it.title),
      link: str(it.link),
      published: str(it.pubDate || it["dc:date"]),
      summary: clip(str(it.description)),
      author: str(it.author || it["dc:creator"]),
    }));
  } else if (doc.feed) {
    title = str(doc.feed.title);
    items = arr(doc.feed.entry).map((e) => ({
      title: str(e.title),
      link: atomLink(e.link),
      published: str(e.published || e.updated),
      summary: clip(str(e.summary || e.content)),
      author: str(e.author?.name),
    }));
  } else {
    throw new Error("parse_failed");
  }

  return {
    query: url,
    feed_url: feedUrl,
    checked_at: new Date().toISOString(),
    title: str(title),
    item_count: items.length,
    items: items.slice(0, limit),
    source: "RSS/Atom",
    summary: `${items.length} item(s) from "${str(title) || feedUrl}".`,
  };
}

const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const str = (x) => (typeof x === "object" && x && "#text" in x ? String(x["#text"]) : x == null ? null : String(x));
const clip = (s) => (s ? s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 400) : null);
function atomLink(link) {
  const links = arr(link);
  const alt = links.find((l) => l["@_rel"] === "alternate") || links[0];
  return alt ? alt["@_href"] || str(alt) : null;
}
