// src/lib/openapi.js
//
// OpenAPI 3.1 description of the public API, generated from the config TOOLS
// table so it always covers every tool. Served at /openapi.json for API
// directories, agent platforms, and codegen. The 402 payment response is
// documented on every paid path.

import { TOOLS } from "../config.js";

const P = (name, required = false, desc = "") => ({
  name, in: "query", required, schema: { type: "string" }, description: desc,
});

// Per-tool query parameters.
const PARAMS = {
  domain: [P("name", true, "Domain label without TLD."), P("tlds", false, "Comma-separated TLDs."), P("format", false, "json | text")],
  domain_enriched: [P("name", true), P("tlds", false, "Up to 5 comma-separated TLDs.")],
  resolve: [P("url", true), P("metadata", false, "true|false")],
  extract: [P("url", true), P("mode", false, "markdown | text | full")],
  render: [P("url", true), P("screenshot", false, "true|false"), P("full_page", false), P("wait_until", false)],
  screenshot: [P("url", true), P("full_page", false), P("width", false), P("height", false), P("format", false, "png|jpeg")],
  unfurl: [P("url", true)],
  feed: [P("url", true), P("limit", false, "Max items (default 20).")],
  oembed: [P("url", true)],
  favicon: [P("host", true, "Domain/hostname.")],
  robots: [P("host", true), P("path", false, "Path to test (default /)."), P("user_agent", false)],
  headers: [P("url", true)],
  dns: [P("host", true, "Hostname to resolve.")],
  ssl: [P("host", true, "Domain/hostname.")],
  whois: [P("domain", true, "Full domain, e.g. example.com.")],
  pdftext: [P("url", true, "URL of a PDF."), P("max_pages", false)],
  qr: [P("data", true, "Text/URL to encode."), P("ecc", false, "L|M|Q|H")],
  diff: [P("url_a", true), P("url_b", false, "If omitted, compares vs latest Wayback snapshot.")],
};

export function buildOpenApi() {
  const okJson = { "200": { description: "Success", content: { "application/json": { schema: { type: "object" } } } } };
  const paid = (price) => ({
    "402": { description: `Payment required — pay ${price} in USDC on Base or Solana via x402, then retry.`, content: { "application/json": { schema: { type: "object" } } } },
  });

  const paths = {};
  for (const [key, tool] of Object.entries(TOOLS)) {
    paths[tool.path] = {
      get: {
        operationId: key,
        summary: tool.description,
        parameters: PARAMS[key] || [],
        responses: { ...okJson, ...paid(tool.price) },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "fetcher.cloud",
      version: "1.1.0",
      description:
        "Pay-per-call tools AI agents can't run themselves: render/screenshot JavaScript pages, extract and unfurl content, parse feeds, resolve links, and look up domains, DNS, IPs, SSL, and more. Paid with x402 (USDC on Base or Solana); every tool has a free daily tier.",
      contact: { url: "https://fetcher.cloud" },
    },
    servers: [{ url: "https://api.fetcher.cloud" }],
    paths,
    "x-payment": {
      protocol: "x402",
      asset: "USDC",
      networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      note: "First unpaid call returns HTTP 402 with machine-readable terms. Free daily tier applies before payment.",
    },
    "x-mcp": { endpoint: "https://api.fetcher.cloud/mcp", transport: "streamable-http" },
  };
}
