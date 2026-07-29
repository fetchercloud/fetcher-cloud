// src/lib/favicon.js — find a site's best icon/logo.
import { normalizeHost, timedFetch } from "./net.js";
import { parse } from "node-html-parser";

const REL = ["apple-touch-icon", "icon", "shortcut icon", "mask-icon"];

export async function findFavicon(rawHost) {
  const host = normalizeHost(rawHost);
  const base = `https://${host}/`;
  const candidates = [];

  try {
    const res = await timedFetch(base, { redirect: "follow" }, 7000);
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      const root = parse((await res.text()).slice(0, 300_000), { comment: false });
      for (const link of root.querySelectorAll("link[rel]")) {
        const rel = (link.getAttribute("rel") || "").toLowerCase();
        if (REL.some((r) => rel.includes(r))) {
          const href = link.getAttribute("href");
          const sizes = link.getAttribute("sizes") || null;
          try { candidates.push({ url: new URL(href, base).toString(), rel, sizes }); } catch {}
        }
      }
      const ogImg = root.querySelector('meta[property="og:image"]')?.getAttribute("content");
      if (ogImg) { try { candidates.push({ url: new URL(ogImg, base).toString(), rel: "og:image", sizes: null }); } catch {} }
    }
  } catch { /* degrade to defaults below */ }

  // Always-available fallbacks.
  candidates.push({ url: `https://${host}/favicon.ico`, rel: "default", sizes: null });
  const google = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;

  // "Best": prefer apple-touch (largest), then largest declared size, then first.
  const best =
    candidates.find((c) => c.rel.includes("apple-touch")) ||
    candidates.filter((c) => c.sizes).sort((a, b) => sizeVal(b.sizes) - sizeVal(a.sizes))[0] ||
    candidates[0];

  return {
    host,
    checked_at: new Date().toISOString(),
    best: best?.url || google,
    candidates: dedupe(candidates),
    google_fallback: google,
    source: "HTML <link> icons + fallbacks",
    summary: `Best icon for ${host}: ${best?.url || google}`,
  };
}

function sizeVal(s) { const n = parseInt((s || "0").split("x")[0], 10); return isNaN(n) ? 0 : n; }
function dedupe(arr) { const seen = new Set(); return arr.filter((c) => !seen.has(c.url) && seen.add(c.url)); }
