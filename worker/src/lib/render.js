// src/lib/render.js
//
// Full headless-browser rendering — the thing agents genuinely can't do
// themselves. Plain fetch() sees the empty shell of a JavaScript app; this
// runs a real Chromium via Cloudflare's Browser Rendering binding, waits
// for the page to settle, and returns the fully-rendered HTML, the visible
// text, and optionally a screenshot.
//
// Requires the `browser` binding (env.BROWSER) + @cloudflare/puppeteer.
// Browser Rendering is a Cloudflare-native product with an included
// monthly allowance; see README for enabling it. If the binding isn't
// present, the route returns a clear "not configured" error instead of
// crashing.

const NAV_TIMEOUT_MS = 20000;

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
 * @param {object} env - Worker env (needs env.BROWSER binding)
 * @param {string} rawUrl
 * @param {object} [opts]
 * @param {boolean} [opts.screenshot=false] - include a base64 PNG screenshot
 * @param {boolean} [opts.full_page=false] - full-page vs viewport screenshot
 * @param {"load"|"domcontentloaded"|"networkidle0"|"networkidle2"} [opts.wait_until="networkidle0"]
 */
export async function renderPage(env, rawUrl, opts = {}) {
  const url = normalizeInput(rawUrl);

  if (!env || !env.BROWSER) {
    const e = new Error("render_not_configured");
    throw e;
  }

  // Lazy import so the rest of the Worker doesn't pay the cost unless
  // /render is actually called.
  const puppeteer = (await import("@cloudflare/puppeteer")).default;

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const response = await page.goto(url, {
      waitUntil: opts.wait_until || "networkidle0",
      timeout: NAV_TIMEOUT_MS,
    });

    const finalUrl = page.url();
    const httpStatus = response ? response.status() : null;
    const title = await page.title();
    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText || "");

    const result = {
      query: url,
      final_url: finalUrl,
      rendered_at: new Date().toISOString(),
      http_status: httpStatus,
      title,
      html,
      text: text.replace(/\s+\n/g, "\n").trim(),
      html_bytes: html.length,
      source: "Cloudflare Browser Rendering (Chromium)",
      summary: `Rendered ${finalUrl}${title ? ` — "${title}"` : ""} (${html.length.toLocaleString()} bytes of DOM).`,
    };

    if (opts.screenshot) {
      const buf = await page.screenshot({
        fullPage: !!opts.full_page,
        type: "png",
      });
      result.screenshot_png_base64 = bytesToBase64(buf);
    }

    return result;
  } finally {
    // Always close so we never leak a browser session against the quota.
    await browser.close();
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
  }
  return btoa(binary);
}
