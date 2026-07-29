// src/lib/screenshot.js — just the screenshot (no DOM), via Browser Rendering.
// Lighter sibling of /render. Requires the `browser` binding (env.BROWSER).
import { normalizeUrl } from "./net.js";

const NAV_TIMEOUT_MS = 20000;

export async function screenshotPage(env, rawUrl, opts = {}) {
  const url = normalizeUrl(rawUrl);
  if (!env || !env.BROWSER) throw new Error("render_not_configured");

  const puppeteer = (await import("@cloudflare/puppeteer")).default;
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    const width = clamp(opts.width, 320, 1920, 1280);
    const height = clamp(opts.height, 320, 2000, 800);
    await page.setViewport({ width, height });
    const response = await page.goto(url, { waitUntil: opts.wait_until || "networkidle0", timeout: NAV_TIMEOUT_MS });

    const buf = await page.screenshot({ fullPage: !!opts.full_page, type: opts.format === "jpeg" ? "jpeg" : "png" });
    return {
      query: url,
      final_url: page.url(),
      http_status: response ? response.status() : null,
      captured_at: new Date().toISOString(),
      width, height, full_page: !!opts.full_page,
      format: opts.format === "jpeg" ? "jpeg" : "png",
      image_base64: bytesToBase64(buf),
      source: "Cloudflare Browser Rendering (Chromium)",
      summary: `Captured ${opts.full_page ? "full-page" : `${width}x${height}`} screenshot of ${page.url()}.`,
    };
  } finally {
    await browser.close();
  }
}

function clamp(v, min, max, dflt) { const n = parseInt(v, 10); return isNaN(n) ? dflt : Math.max(min, Math.min(max, n)); }
function bytesToBase64(bytes) {
  let bin = ""; const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(bin);
}
