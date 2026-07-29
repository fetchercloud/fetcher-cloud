// src/routes/mcp.js
//
// Model Context Protocol server (Streamable HTTP transport). Exposes every
// fetcher tool to MCP clients (Claude Desktop, ChatGPT, Cursor, custom
// agents) and makes fetcher listable in MCP registries.
//
// Stateless JSON-RPC 2.0 over POST. Each tools/call runs the same lib logic
// as the paid HTTP routes, under the same per-caller daily free tier; past
// the free tier it returns a note pointing to the paid HTTP endpoint (which
// enforces x402). No secrets or payment happen inside MCP itself.

import { checkDomain, DEFAULT_TLDS } from "../lib/rdap.js";
import { enrichResults } from "../lib/enrich.js";
import { resolveUrl } from "../lib/resolve.js";
import { extractContent } from "../lib/extract.js";
import { renderPage } from "../lib/render.js";
import { screenshotPage } from "../lib/screenshot.js";
import { unfurl } from "../lib/unfurl.js";
import { getFeed } from "../lib/feed.js";
import { getOembed } from "../lib/oembed.js";
import { findFavicon } from "../lib/favicon.js";
import { checkRobots } from "../lib/robots.js";
import { inspectHeaders } from "../lib/headers.js";
import { getAllDnsRecords } from "../lib/dns.js";
import { getSsl } from "../lib/ssl.js";
import { whois } from "../lib/whois.js";
import { extractPdf } from "../lib/pdftext.js";
import { makeQr } from "../lib/qr.js";
import { diffPages } from "../lib/diff.js";
import { consumeQuota } from "../lib/counter.js";
import { FREE_LIMITS, ENRICHED_DEFAULT_TLDS, TOOLS as CONFIG_TOOLS, CATEGORY } from "../config.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "fetcher.cloud", version: "1.1.0" };
const API_BASE = "https://api.fetcher.cloud";

const S = { url: { type: "string", description: "Target URL or hostname." } };
const okText = (s) => ({ content: [{ type: "text", text: s }] });
const json = (o) => okText(JSON.stringify(o, null, 2));

// Tool registry: name -> { key (free-tier bucket), schema, run }.
const REGISTRY = {
  render_page: {
    key: "render",
    description: "Render a JavaScript page in a real browser; returns rendered HTML, text, optional screenshot.",
    schema: { type: "object", properties: { url: S.url, screenshot: { type: "boolean" }, full_page: { type: "boolean" } }, required: ["url"] },
    run: async (env, a) => {
      try { return json(await renderPage(env, a.url, { screenshot: !!a.screenshot, full_page: !!a.full_page })); }
      catch (e) { if (e.message === "render_not_configured") return okText("Rendering isn't enabled on this deployment yet."); throw mapErr(e); }
    },
  },
  screenshot_page: {
    key: "screenshot",
    description: "Screenshot a page (real browser) as a base64 PNG/JPEG.",
    schema: { type: "object", properties: { url: S.url, full_page: { type: "boolean" } }, required: ["url"] },
    run: async (env, a) => {
      try { return json(await screenshotPage(env, a.url, { full_page: !!a.full_page })); }
      catch (e) { if (e.message === "render_not_configured") return okText("Rendering isn't enabled on this deployment yet."); throw mapErr(e); }
    },
  },
  extract_content: {
    key: "extract",
    description: "Extract a page's main content as clean Markdown + text with metadata.",
    schema: { type: "object", properties: { url: S.url, mode: { type: "string", enum: ["markdown", "text", "full"] } }, required: ["url"] },
    run: async (_e, a) => json(await extractContent(a.url, { mode: a.mode || "full" })),
  },
  resolve_url: {
    key: "resolve",
    description: "Follow a URL's full redirect chain; return final URL, hops, and metadata.",
    schema: { type: "object", properties: { url: S.url }, required: ["url"] },
    run: async (_e, a) => json(await resolveUrl(a.url)),
  },
  unfurl_url: {
    key: "unfurl",
    description: "Link preview card (title, description, image, favicon) for any URL.",
    schema: { type: "object", properties: { url: S.url }, required: ["url"] },
    run: async (_e, a) => json(await unfurl(a.url)),
  },
  get_feed: {
    key: "feed",
    description: "Discover and parse a site's RSS/Atom feed into JSON items.",
    schema: { type: "object", properties: { url: S.url, limit: { type: "number" } }, required: ["url"] },
    run: async (_e, a) => json(await getFeed(a.url, { limit: Math.min(a.limit || 20, 50) })),
  },
  get_oembed: {
    key: "oembed",
    description: "Rich embed (oEmbed) data for a media URL (YouTube, Vimeo, X, Spotify...).",
    schema: { type: "object", properties: { url: S.url }, required: ["url"] },
    run: async (_e, a) => json(await getOembed(a.url)),
  },
  find_favicon: {
    key: "favicon",
    description: "Find a site's best icon/logo.",
    schema: { type: "object", properties: { host: S.url }, required: ["host"] },
    run: async (_e, a) => json(await findFavicon(a.host)),
  },
  check_robots: {
    key: "robots",
    description: "Parse robots.txt; answer whether a user-agent may crawl a path; list sitemaps.",
    schema: { type: "object", properties: { host: S.url, path: { type: "string" }, user_agent: { type: "string" } }, required: ["host"] },
    run: async (_e, a) => json(await checkRobots(a.host, { path: a.path || "/", userAgent: a.user_agent || "*" })),
  },
  inspect_headers: {
    key: "headers",
    description: "HTTP response headers + security-header analysis for a URL.",
    schema: { type: "object", properties: { url: S.url }, required: ["url"] },
    run: async (_e, a) => json(await inspectHeaders(a.url)),
  },
  dns_lookup: {
    key: "dns",
    description: "Full DNS record dump (A/AAAA/MX/NS/TXT/SOA/CAA/CNAME) for a host.",
    schema: { type: "object", properties: { host: S.url }, required: ["host"] },
    run: async (_e, a) => json(await getAllDnsRecords(String(a.host).trim())),
  },
  ssl_lookup: {
    key: "ssl",
    description: "TLS certificate details (issuer, expiry, SANs) via Certificate Transparency logs.",
    schema: { type: "object", properties: { host: S.url }, required: ["host"] },
    run: async (_e, a) => json(await getSsl(a.host)),
  },
  whois_lookup: {
    key: "whois",
    description: "Deep domain registration record via RDAP (registrar, dates, nameservers, DNSSEC).",
    schema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
    run: async (_e, a) => json(await whois(a.domain)),
  },
  extract_pdf: {
    key: "pdftext",
    description: "Extract text + metadata from a PDF URL (text-based PDFs).",
    schema: { type: "object", properties: { url: S.url, max_pages: { type: "number" } }, required: ["url"] },
    run: async (_e, a) => json(await extractPdf(a.url, { max_pages: a.max_pages || 0 })),
  },
  generate_qr: {
    key: "qr",
    description: "Generate a QR code (SVG) for text or a URL.",
    schema: { type: "object", properties: { data: { type: "string" }, ecc: { type: "string", enum: ["L", "M", "Q", "H"] } }, required: ["data"] },
    run: async (_e, a) => json(await makeQr(a.data, { ecc: a.ecc || "M" })),
  },
  diff_pages: {
    key: "diff",
    description: "Compare two pages (or one page vs its latest Wayback snapshot); return what changed.",
    schema: { type: "object", properties: { url_a: S.url, url_b: { type: "string" } }, required: ["url_a"] },
    run: async (_e, a) => json(await diffPages({ url_a: a.url_a, url_b: a.url_b })),
  },
  check_domain: {
    key: "domain",
    description: "Check domain availability across TLDs via RDAP. Set enriched=true for DNS, age, and Wayback history.",
    schema: { type: "object", properties: { name: { type: "string" }, tlds: { type: "array", items: { type: "string" } }, enriched: { type: "boolean" } }, required: ["name"] },
    run: async (_e, a) => {
      const tlds = Array.isArray(a.tlds) && a.tlds.length ? a.tlds : a.enriched ? ENRICHED_DEFAULT_TLDS : DEFAULT_TLDS;
      let r = await checkDomain(a.name, tlds);
      if (a.enriched) r = await enrichResults(r);
      return json(r);
    },
    limitKey: (a) => (a.enriched ? "domain_enriched" : "domain"),
  },
};

const TOOLS = Object.entries(REGISTRY).map(([name, t]) => {
  const ct = CONFIG_TOOLS[t.key] || {};
  const cat = CATEGORY[t.key] || "utility";
  const free = ct.freePerDay ?? FREE_LIMITS[t.key];
  return {
    name,
    description: `${t.description} (${cat}; ${ct.price || "$?"}/call in USDC via x402, ${free} free/day).`,
    inputSchema: t.schema,
  };
});

function mapErr(e) {
  const code = ["missing_url", "invalid_url", "missing_host", "invalid_host", "missing_ip", "invalid_ip"].includes(e.message)
    ? -32602 : -32603;
  const err = new Error(e.message || "error");
  err.rpcCode = code;
  return err;
}

async function runTool(env, ip, name, args = {}) {
  const entry = REGISTRY[name];
  if (!entry) { const e = new Error(`Unknown tool: ${name}`); e.rpcCode = -32602; throw e; }

  const limitKey = entry.limitKey ? entry.limitKey(args) : entry.key;
  const { state } = await consumeQuota(env, limitKey, ip, FREE_LIMITS[limitKey]);
  if (state === "exhausted") {
    return okText(
      `Free tier reached for this tool (${FREE_LIMITS[limitKey]}/day). For unmetered use, ` +
      `call the paid HTTP endpoint and pay per call with x402 (USDC on Base or Solana). See ${API_BASE}/docs.`
    );
  }
  try { return await entry.run(env, args); }
  catch (e) { throw e.rpcCode ? e : mapErr(e); }
}

async function handleMessage(env, ip, msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;
  try {
    let result;
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "fetcher.cloud - tools AI agents can't run themselves: render/screenshot pages, extract " +
            "and unfurl content, parse feeds, resolve links, and look up domains, DNS, IPs, SSL, and more. " +
            "Free daily tier; paid per call over x402 (USDC on Base/Solana) via the HTTP API.",
        };
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call":
        result = await runTool(env, ip, params?.name, params?.arguments || {});
        break;
      case "ping":
        result = {};
        break;
      default:
        if (method?.startsWith("notifications/")) return null;
        { const e = new Error(`Method not found: ${method}`); e.rpcCode = -32601; throw e; }
    }
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, result };
  } catch (err) {
    if (isNotification) return null;
    return { jsonrpc: "2.0", id: id ?? null, error: { code: err.rpcCode || -32603, message: err.message || "Internal error" } };
  }
}

export async function mcpHandler(c) {
  const ip = c.req.header("cf-connecting-ip") || "anonymous";
  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleMessage(c.env, ip, m)))).filter(Boolean);
    return responses.length ? c.json(responses) : c.body(null, 202);
  }
  const response = await handleMessage(c.env, ip, body);
  return response === null ? c.body(null, 202) : c.json(response);
}

export function mcpInfoHandler(c) {
  return c.json({
    server: SERVER_INFO,
    protocol: "Model Context Protocol",
    protocolVersion: PROTOCOL_VERSION,
    transport: "Streamable HTTP (JSON-RPC 2.0 over POST to this URL)",
    tool_count: TOOLS.length,
    tools: TOOLS.map((t) => t.name),
    docs: `${API_BASE}/docs`,
  });
}

export { TOOLS as MCP_TOOLS };
