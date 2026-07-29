// src/index.js
//
// fetcher.cloud on Cloudflare Workers — x402-paid tools AI agents can't run
// themselves. Architecture per route: manifest -> free-tier gate -> x402
// paywall -> handler. Built on Hono (Express doesn't run on the Workers
// edge runtime).
//
// Payments accept USDC on BOTH Base (EVM) and Solana (SVM). Each protected
// route advertises both networks in its 402 `accepts` list, so a paying
// agent uses whichever chain it holds funds on.
//
// IMPORTANT: @x402/* are fast-moving (v2.19.0 here). This wiring —
// registering ExactEvmScheme + ExactSvmScheme on the resource server and
// the paymentMiddleware(routes, server, ...) signature — was verified
// against the installed packages, not assumed from docs. Re-verify on
// upgrade.

import { Hono } from "hono";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { paymentMiddleware } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";

import { domainHandler, domainEnrichedHandler } from "./routes/domain.js";
import { resolveHandler } from "./routes/resolve.js";
import { extractHandler } from "./routes/extract.js";
import { renderHandler } from "./routes/render.js";
import { mcpHandler, mcpInfoHandler } from "./routes/mcp.js";
import {
  dnsHandler, headersHandler, robotsHandler, unfurlHandler,
  faviconHandler, oembedHandler, feedHandler, sslHandler, whoisHandler,
  pdfTextHandler, qrHandler, diffHandler, screenshotHandler,
} from "./routes/extra.js";
import { buildOpenApi } from "./lib/openapi.js";
import { buildCapabilities, buildPricing } from "./lib/capabilities.js";
import { CATEGORY } from "./config.js";
import { freeTierGate } from "./middleware/freeTier.js";
import { TOOLS, PAYMENT_NETWORKS } from "./config.js";

// Map each config-table key to its handler. Adding a tool = add it to
// config.js TOOLS + a lib + a route + one line here.
const HANDLERS = {
  domain: domainHandler,
  domain_enriched: domainEnrichedHandler,
  resolve: resolveHandler,
  extract: extractHandler,
  render: renderHandler,
  screenshot: screenshotHandler,
  unfurl: unfurlHandler,
  feed: feedHandler,
  oembed: oembedHandler,
  favicon: faviconHandler,
  robots: robotsHandler,
  headers: headersHandler,
  dns: dnsHandler,
  ssl: sslHandler,
  whois: whoisHandler,
  pdftext: pdfTextHandler,
  qr: qrHandler,
  diff: diffHandler,
};

const BASE_MAINNET = "eip155:8453";

// Network registry — how to build an accepts entry + register a scheme per
// chain. The enabled set comes from config.PAYMENT_NETWORKS, so dropping
// Solana (if your facilitator doesn't settle it) is a one-line config change.
const NETWORKS = {
  base:   { id: BASE_MAINNET,         payTo: (env) => env.PAYMENT_ADDRESS,        scheme: () => new ExactEvmScheme(), label: "Base (eip155:8453)" },
  solana: { id: SOLANA_MAINNET_CAIP2, payTo: (env) => env.PAYMENT_ADDRESS_SOLANA, scheme: () => new ExactSvmScheme(), label: `Solana (${SOLANA_MAINNET_CAIP2})` },
};
const ENABLED = PAYMENT_NETWORKS.filter((n) => NETWORKS[n]);

const app = new Hono();


// Build the x402 `accepts` list for a price: same USD amount payable in
// USDC on Base or Solana. payTo differs per chain (different address types).
function acceptsFor(price, env) {
  return ENABLED.map((n) => ({
    scheme: "exact", price, network: NETWORKS[n].id, payTo: NETWORKS[n].payTo(env),
  }));
}

function routeConfig(tool, env, outputProps) {
  return {
    accepts: acceptsFor(tool.price, env),
    description: tool.description,
    mimeType: "application/json",
    discoverable: true,
    outputSchema: { type: "object", properties: outputProps },
  };
}

// ---------------------------------------------------------------------------
// Build the x402 resource server + one payment middleware covering every
// paid route, once per isolate. Both EVM and SVM exact schemes are
// registered so Base and Solana payments can be built and verified.
// ---------------------------------------------------------------------------
let cachedPaymentMw = null;
function getPaymentMiddleware(env) {
  if (cachedPaymentMw) return cachedPaymentMw;

  // Build the Coinbase facilitator config from the Worker's env secrets.
  // (The package's default `facilitator` reads process.env, which Workers
  // doesn't populate — so we pass the keys explicitly from env.)
  const facilitatorConfig = createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET);
  const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);
  let resourceServer = new x402ResourceServer(facilitatorClient);
  for (const n of ENABLED) resourceServer = resourceServer.register(NETWORKS[n].id, NETWORKS[n].scheme());

  const commonOut = {
    query: { type: "string" },
    source: { type: "string" },
    summary: { type: "string" },
  };

  // One paywall entry per tool, generated from the config table so adding a
  // tool auto-wires its payment terms. Output schema is generic (agents get
  // the real shape from the 200 response); the price/description are exact.
  const routes = {};
  for (const tool of Object.values(TOOLS)) {
    routes[`GET ${tool.path}`] = routeConfig(tool, env, commonOut);
  }

  cachedPaymentMw = paymentMiddleware(
    routes,
    resourceServer,
    undefined, // paywallConfig
    undefined, // paywall provider
    true // syncFacilitatorOnStart — REQUIRED: fetches the facilitator's
    // supported payment kinds on first request so 402s can be built. Without
    // this the server can't advertise payment terms. It's already lazy (runs
    // on first paid request), so it doesn't block boot.
  );

  return cachedPaymentMw;
}

// Wire one paid tool: free-tier gate -> x402 paywall -> handler.
function mount(tool, keyName, handler) {
  app.get(
    tool.path,
    (c, next) => freeTierGate(keyName, tool.freePerDay, handler)(c, next),
    (c, next) => getPaymentMiddleware(c.env)(c, next),
    handler
  );
}

// ---------------------------------------------------------------------------
// Root manifest — machine-readable index of everything on offer.
// ---------------------------------------------------------------------------
app.get("/", (c) =>
  c.json({
    name: "fetcher.cloud",
    tagline: "The web capability layer for AI agents.",
    description:
      "One MCP server and API giving AI agents the public web: render & screenshot pages, extract & unfurl content, parse feeds, resolve links, and inspect domains, DNS, SSL, and WHOIS. 18 capabilities, pay-per-call in USDC via x402.",
    tools: Object.fromEntries(
      Object.entries(TOOLS).map(([k, t]) => [
        k,
        {
          path: t.path,
          method: "GET",
          category: CATEGORY[k] || "utility",
          price: `${t.price} USDC`,
          free_tier: `${t.freePerDay} requests/day`,
          status: "live",
          description: t.description,
        },
      ])
    ),
    mcp: "/mcp",
    capabilities: "/capabilities",
    openapi: "/openapi.json",
    pricing: "/pricing.json",
    llms: "https://fetcher.cloud/llms.txt",
    docs: "/docs",
    payment: {
      protocol: "x402",
      asset: "USDC",
      networks: ENABLED.map((n) => NETWORKS[n].label),
    },
  })
);

// ---------------------------------------------------------------------------
// Mount every tool from the config table: free-tier gate -> paywall ->
// handler. /domain/enriched and /domain are distinct static paths, so Hono's
// router matches each correctly regardless of order.
// ---------------------------------------------------------------------------
for (const [key, tool] of Object.entries(TOOLS)) {
  const handler = HANDLERS[key];
  if (handler) mount(tool, key, handler);
  else console.warn(`[index] no handler mapped for tool "${key}"`);
}

// ---------------------------------------------------------------------------
// Discovery surfaces: MCP server, OpenAPI spec, and a plugin manifest.
// ---------------------------------------------------------------------------
app.post("/mcp", mcpHandler);
app.get("/mcp", mcpInfoHandler);

app.get("/openapi.json", (c) => c.json(buildOpenApi()));

// Rich, agent-oriented capability catalog + pricing (generated from config).
app.get("/capabilities", (c) => c.json(buildCapabilities()));
app.get("/pricing.json", (c) => c.json(buildPricing()));

app.get("/.well-known/ai-plugin.json", (c) =>
  c.json({
    schema_version: "v1",
    name_for_human: "fetcher.cloud",
    name_for_model: "fetcher",
    description_for_human:
      "Tools AI agents can't run themselves: render JS pages, extract clean content, resolve links, check domains.",
    description_for_model:
      "Call fetcher to render JavaScript pages in a real browser, extract clean article Markdown, resolve URL redirect chains, and check domain availability. Pay-per-call via x402 (USDC on Base/Solana) with a free daily tier.",
    api: { type: "openapi", url: "https://api.fetcher.cloud/openapi.json" },
    logo_url: "https://fetcher.cloud/favicon.svg",
    contact_email: "hello@fetcher.cloud",
    legal_info_url: "https://fetcher.cloud/",
  })
);

// ---------------------------------------------------------------------------
// Human-readable docs.
// ---------------------------------------------------------------------------
app.get("/docs", (c) =>
  c.text(
    [
      "fetcher.cloud — tools AI agents fail to run themselves",
      "Pay per call in USDC on Base or Solana (x402). Every tool has a free daily tier first.",
      "",
      "GET /domain?name=fetcher&tlds=com,io,dev,ai,app",
      "  Real-time domain availability via RDAP.  $0.004 · 100 free/day",
      "  &format=text for a human table. First unpaid call returns HTTP 402 with terms.",
      "",
      "GET /domain/enriched?name=fetcher&tlds=com,io",
      "  Availability + DNS, domain age, and Wayback history.  $0.01 · 50 free/day",
      "",
      "GET /resolve?url=bit.ly/xyz",
      "  Follow the full redirect chain; return final URL, hops, and metadata.  $0.003 · 100 free/day",
      "",
      "GET /extract?url=example.com/article&mode=markdown",
      "  Clean main content as Markdown/text + metadata.  $0.005 · 60 free/day",
      "  mode = markdown | text | full (default full).",
      "",
      "GET /render?url=example.com&screenshot=true",
      "  Real Chromium render of JS pages: rendered HTML, text, optional PNG.  $0.02 · 20 free/day",
      "  Requires the Browser Rendering binding — see README.",
      "",
      "Manifest + machine-readable pricing: GET /",
      "OpenAPI spec: GET /openapi.json",
      "MCP server (Streamable HTTP, JSON-RPC): POST /mcp — callable from Claude, ChatGPT, Cursor, etc.",
    ].join("\n")
  )
);

export { FreeTierCounter } from "./counter-do.js";
export default app;
