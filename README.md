# fetcher.cloud — the web capability layer for AI agents

**One MCP server and API that gives an autonomous AI agent the public web.**
Render and screenshot pages, extract clean content, resolve links, parse feeds,
and inspect domains, DNS, SSL, and WHOIS — **18 capabilities**, paid per-call in
**USDC via [x402](https://github.com/coinbase/x402)**, with a free daily tier.

> Whenever an agent needs something from the internet, it uses fetcher.

[![x402](https://img.shields.io/badge/payments-x402-5EF2C9)](https://github.com/coinbase/x402)
[![MCP](https://img.shields.io/badge/MCP-Streamable_HTTP-8B7DFF)](https://modelcontextprotocol.io)
[![Cloudflare Workers](https://img.shields.io/badge/runs_on-Cloudflare_Workers-F38020)](https://workers.cloudflare.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## Why it exists

LLMs are brilliant at reasoning and blind at retrieval. The moment real-world
data needs a browser, a payment, or a login, an agent stalls. fetcher is the
specialist capability layer it calls — a single interface for everything an
agent can't do alone, billed the only way that works for software: per call,
in stablecoins, with no account or API key.

## How agents use it

1. **Discover** — `GET /capabilities` returns every capability with category,
   pricing, examples, and schemas. Or connect the **MCP server** at `/mcp`.
2. **Call** — a normal `GET` request. The first unpaid call past the free tier
   returns `402 Payment Required` with machine-readable terms.
3. **Pay** — the agent's wallet pays a fraction of a cent in USDC on Base and
   retries. No human in the loop.

Works with **Conway Automaton**, **Claude**, **OpenAI Agents**, **Google ADK**,
any **MCP** client, or any agent that can make an HTTP request.

## The capabilities

| Category | Capabilities |
|---|---|
| Browser & rendering | `render`, `screenshot` |
| Content & extraction | `extract`, `unfurl`, `feed`, `oembed`, `pdf-text`, `diff` |
| Web intelligence | `resolve`, `headers`, `robots`, `favicon` |
| Domain & DNS | `domain`, `domain/enriched`, `whois`, `dns`, `ssl` |
| Utility | `qr` |

Full catalog with pricing and examples: **`https://api.fetcher.cloud/capabilities`**

## Machine-readable surfaces

`/` (manifest) · `/capabilities` · `/pricing.json` · `/openapi.json` · `/mcp` ·
`/.well-known/ai-plugin.json` · `llms.txt`

## Repository layout

```
worker/         # the Cloudflare Worker (API, payments, MCP)   → see worker/README.md
website/        # the landing page (Cloudflare Pages)
test-client/    # a script that pays an endpoint on Base mainnet
conway-skill/   # ready-to-submit Conway Automaton skill
```

## Deploy

See **`worker/README.md`** and **`DEPLOY.md`** for step-by-step deployment
(Cloudflare Workers + Pages). Payments require Coinbase CDP facilitator keys
set as Worker secrets.

## License

MIT — see [LICENSE](./LICENSE).
