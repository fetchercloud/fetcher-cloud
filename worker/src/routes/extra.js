// src/routes/extra.js
//
// Thin Hono handlers for the 15 additional tools. Each parses query params,
// calls its lib, and maps known errors to clean HTTP status codes via fail().

import { getAllDnsRecords } from "../lib/dns.js";
import { inspectHeaders } from "../lib/headers.js";
import { checkRobots } from "../lib/robots.js";
import { unfurl } from "../lib/unfurl.js";
import { findFavicon } from "../lib/favicon.js";
import { getOembed } from "../lib/oembed.js";
import { getFeed } from "../lib/feed.js";
import { getSsl } from "../lib/ssl.js";
import { whois } from "../lib/whois.js";
import { extractPdf } from "../lib/pdftext.js";
import { makeQr } from "../lib/qr.js";
import { diffPages } from "../lib/diff.js";
import { screenshotPage } from "../lib/screenshot.js";
import { inspectContent, inspectTransaction } from "../lib/guard.js";

// Map a thrown error to a JSON response + status.
function fail(c, err, fallbackMsg) {
  const m = err.message || "error";
  const map = {
    missing_url: [400, "A 'url' query param is required."],
    invalid_url: [400, "Provide a valid http(s) URL."],
    missing_host: [400, "A 'host' query param is required."],
    invalid_host: [400, "Provide a valid hostname."],
    missing_ip: [400, "An 'ip' query param is required."],
    invalid_ip: [400, "Provide a valid IPv4 or IPv6 address."],
    missing_text: [400, "A 'text' query param is required."],
    invalid_to: [400, "Provide a valid 'to' address (0x + 40 hex)."],
    invalid_data: [400, "Provide valid hex calldata in 'data'."],
    invalid_domain: [400, "Provide a valid domain (label.tld)."],
    missing_data: [400, "A 'data' query param is required."],
    too_long: [413, "Input too long."],
    too_large: [413, "The file is too large to process."],
    invalid_amount: [400, "Provide a numeric 'amount'."],
    timeout: [504, "The upstream took too long."],
    upstream_status: [502, `Upstream returned HTTP ${err.status || "error"}.`],
    fetch_failed: [502, "Could not reach the target."],
    not_a_pdf: [415, "That URL is not a PDF."],
    no_feed: [404, "No RSS/Atom feed found for that URL."],
    no_oembed: [404, "No oEmbed provider found for that URL."],
    no_snapshot: [404, "No Wayback snapshot found to compare against; pass url_b instead."],
    pair_unavailable: [502, "That currency pair isn't available."],
    ct_unavailable: [502, "Certificate Transparency logs are unavailable right now."],
    parse_failed: [502, "Could not parse the response."],
    render_not_configured: [501, "Browser Rendering isn't enabled on this deployment — see README."],
  };
  const [status, message] = map[m] || [502, fallbackMsg || "Request failed."];
  return c.json({ error: m, message, ...(err.status ? { status: err.status } : {}) }, status);
}

const q = (c, k) => c.req.query(k);

export const dnsHandler = async (c) => {
  const host = q(c, "host") || q(c, "name");
  if (!host) return c.json({ error: "missing_host", message: "A 'host' query param is required." }, 400);
  try { return c.json(await getAllDnsRecords(host.trim())); } catch (e) { return fail(c, e); }
};

export const headersHandler = async (c) => {
  try { return c.json(await inspectHeaders(q(c, "url"))); } catch (e) { return fail(c, e); }
};

export const robotsHandler = async (c) => {
  try {
    return c.json(await checkRobots(q(c, "host") || q(c, "url"), { path: q(c, "path") || "/", userAgent: q(c, "user_agent") || "*" }));
  } catch (e) { return fail(c, e); }
};


export const unfurlHandler = async (c) => {
  try { return c.json(await unfurl(q(c, "url"))); } catch (e) { return fail(c, e); }
};

export const faviconHandler = async (c) => {
  try { return c.json(await findFavicon(q(c, "host") || q(c, "url"))); } catch (e) { return fail(c, e); }
};

export const oembedHandler = async (c) => {
  try { return c.json(await getOembed(q(c, "url"))); } catch (e) { return fail(c, e); }
};

export const feedHandler = async (c) => {
  const limit = Math.min(parseInt(q(c, "limit") || "20", 10) || 20, 50);
  try { return c.json(await getFeed(q(c, "url"), { limit })); } catch (e) { return fail(c, e); }
};

export const sslHandler = async (c) => {
  try { return c.json(await getSsl(q(c, "host") || q(c, "domain"))); } catch (e) { return fail(c, e); }
};

export const whoisHandler = async (c) => {
  const d = q(c, "domain") || q(c, "name");
  if (!d) return c.json({ error: "missing_domain", message: "A 'domain' query param is required." }, 400);
  try { return c.json(await whois(d)); } catch (e) { return fail(c, e); }
};


export const pdfTextHandler = async (c) => {
  const max_pages = parseInt(q(c, "max_pages") || "0", 10) || 0;
  try { return c.json(await extractPdf(q(c, "url"), { max_pages })); } catch (e) { return fail(c, e); }
};

export const qrHandler = async (c) => {
  try { return c.json(await makeQr(q(c, "data") || q(c, "text"), { ecc: q(c, "ecc") || "M" })); } catch (e) { return fail(c, e); }
};

export const diffHandler = async (c) => {
  try { return c.json(await diffPages({ url_a: q(c, "url_a") || q(c, "url"), url_b: q(c, "url_b") })); } catch (e) { return fail(c, e); }
};

export const screenshotHandler = async (c) => {
  try {
    return c.json(await screenshotPage(c.env, q(c, "url"), {
      full_page: q(c, "full_page") === "true",
      width: q(c, "width"), height: q(c, "height"),
      format: q(c, "format"), wait_until: q(c, "wait_until"),
    }));
  } catch (e) { return fail(c, e); }
};

export const guardInspectHandler = async (c) => {
  const text = q(c, "text") || q(c, "content");
  if (!text) return c.json({ error: "missing_text", message: "A 'text' query param is required." }, 400);
  const deep = q(c, "deep") !== "false";
  try { return c.json(await inspectContent(text, { deep }, c.env)); } catch (e) { return fail(c, e); }
};

export const guardTxHandler = async (c) => {
  const to = q(c, "to");
  if (!to) return c.json({ error: "missing_to", message: "A 'to' address query param is required." }, 400);
  const caps = {};
  if (q(c, "max_value_wei")) caps.maxValueWei = q(c, "max_value_wei");
  if (q(c, "block_unlimited_approvals") === "true") caps.blockUnlimitedApprovals = true;
  const tx = { to, data: q(c, "data"), value: q(c, "value"), chain: q(c, "chain"), from: q(c, "from"), caps, simulate: q(c, "simulate") !== "false" };
  try { return c.json(await inspectTransaction(tx, c.env)); } catch (e) { return fail(c, e); }
};
