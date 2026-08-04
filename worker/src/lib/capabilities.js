// src/lib/capabilities.js
//
// Generates the machine-readable capability catalog + pricing from the single
// config table, so agents can discover everything fetcher does (categories,
// pricing, examples, params) without scraping docs. Served at /capabilities
// and /pricing.json. Nothing here is hand-maintained — it all derives from
// config.TOOLS, so it can never drift from the live routes.

import { TOOLS, CATEGORY, CATEGORY_LABELS, EXAMPLE, BROWSER_TOOLS } from "../config.js";

const hideBrowser = (inc) => (inc ? () => true : ([k]) => !BROWSER_TOOLS.includes(k));

const API_BASE = "https://api.fetcher.cloud";

// Human/agent-oriented "when to use this" tasks per tool.
const USE_WHEN = {
  render: "You need the fully-rendered DOM/text of a JavaScript-heavy page or SPA that plain fetch can't read.",
  screenshot: "You need a visual capture (PNG/JPEG) of how a page looks.",
  extract: "You need clean article text/Markdown from a page for reading, RAG, or summarising — without nav/ads.",
  unfurl: "You need a link-preview card (title, description, image) for a URL.",
  feed: "You need the latest posts/items from a site as structured JSON (RSS/Atom).",
  oembed: "You need embed metadata for a media URL (YouTube, Vimeo, X, Spotify…).",
  pdftext: "You need the text/metadata out of a PDF file at a URL.",
  diff: "You need to know what changed between two pages, or a page vs its past snapshot.",
  resolve: "You were handed a short/tracking/wrapped link and need to know where it really goes.",
  headers: "You need a URL's HTTP headers and a security-header assessment.",
  robots: "You need to know whether you're allowed to crawl a path, and find sitemaps.",
  favicon: "You need a site's icon/logo.",
  domain: "You need to know if a domain name is available to register.",
  domain_enriched: "You need to vet a domain before buying — DNS, mail, age, and past usage.",
  whois: "You need the registration record for a domain (registrar, dates, nameservers).",
  dns: "You need a full DNS record dump for a hostname.",
  ssl: "You need a site's TLS certificate details and expiry.",
  qr: "You need to turn text or a URL into a QR code.",
};

export function buildCapabilities(includeBrowser = true) {
  const categories = {};
  const capabilities = Object.entries(TOOLS).filter(hideBrowser(includeBrowser)).map(([key, t]) => {
    const cat = CATEGORY[key] || "utility";
    categories[cat] = CATEGORY_LABELS[cat] || cat;
    return {
      name: key,
      endpoint: `${API_BASE}${t.path}`,
      method: "GET",
      category: cat,
      description: t.description,
      use_when: USE_WHEN[key] || null,
      pricing: { amount: t.price, asset: "USDC", per: "call", free_tier: `${t.freePerDay}/day` },
      example: `${API_BASE}${t.path}${EXAMPLE[key] || ""}`,
      output: "application/json",
      status: key === "render" || key === "screenshot" ? "requires_browser_rendering" : "live",
    };
  });

  return {
    service: "fetcher.cloud",
    summary: "The web capability layer for AI agents — one endpoint set for render, screenshot, extract, resolve, feeds, DNS, SSL, WHOIS, domains, and more.",
    capability_count: capabilities.length,
    categories,
    payment: {
      protocol: "x402",
      asset: "USDC",
      networks: ["Base (eip155:8453)"],
      how: "Call the endpoint; a 402 returns machine-readable terms; pay in USDC and retry. Every capability has a free daily tier first.",
    },
    interfaces: { http: `${API_BASE}/`, mcp: `${API_BASE}/mcp`, openapi: `${API_BASE}/openapi.json` },
    generated_at: new Date().toISOString(),
    capabilities,
  };
}

export function buildPricing(includeBrowser = true) {
  return {
    service: "fetcher.cloud",
    asset: "USDC",
    protocol: "x402",
    generated_at: new Date().toISOString(),
    tools: Object.fromEntries(
      Object.entries(TOOLS).filter(hideBrowser(includeBrowser)).map(([k, t]) => [k, { path: t.path, price: t.price, free_per_day: t.freePerDay }])
    ),
  };
}

// Human-readable docs, generated from config so free tiers/prices never drift.
export function buildDocs(includeBrowser = true) {
  const lines = [
    "fetcher.cloud \u2014 the web capability layer for AI agents",
    "Pay per call in USDC on Base via x402. Every capability has a free daily tier first;",
    "the first unpaid call past that tier returns HTTP 402 with machine-readable terms.",
    "Tip: append ?_forcepay=1 to any path to reach the 402 payment gate without spending",
    "the free tier (useful for monitors and testing).",
    "",
  ];
  const byCat = {};
  for (const [k, t] of Object.entries(TOOLS)) {
    if (!includeBrowser && BROWSER_TOOLS.includes(k)) continue;
    const cat = CATEGORY[k] || "utility";
    (byCat[cat] = byCat[cat] || []).push([k, t]);
  }
  for (const [cat, items] of Object.entries(byCat)) {
    lines.push(`## ${CATEGORY_LABELS[cat] || cat}`);
    for (const [k, t] of items) {
      const note = (k === "render" || k === "screenshot") ? "  (requires Browser Rendering binding)" : "";
      lines.push(`GET ${t.path}${EXAMPLE[k] || ""}`);
      lines.push(`  ${t.description}  ${t.price} \u00b7 ${t.freePerDay} free/day${note}`);
    }
    lines.push("");
  }
  lines.push("Manifest: GET /  \u00b7  Capabilities: GET /capabilities  \u00b7  Pricing: GET /pricing.json");
  lines.push("OpenAPI: GET /openapi.json  \u00b7  MCP (Streamable HTTP, JSON-RPC): POST /mcp");
  return lines.join("\n");
}
