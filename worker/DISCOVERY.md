# Getting fetcher.cloud found — by people AND agents

Everything below is already wired into the code/site. This is the checklist
of where to *submit* once you've deployed, so the tools actually get indexed
and listed. Do these after `wrangler deploy` (API) and `wrangler pages
deploy` (site), and after your first real settled x402 payment.

## Already built in (no action needed)

- **SEO**: `<title>`, meta description/keywords, canonical, Open Graph +
  Twitter cards, and a rasterized `og.png` social card — all in
  `fetcher-site/index.html`.
- **Structured data**: JSON-LD `WebAPI` (with per-tool offers/pricing) and a
  `FAQPage` — eligible for Google rich results.
- **`sitemap.xml`** and **`robots.txt`** (explicitly welcomes GPTBot,
  ClaudeBot, PerplexityBot, Google-Extended, CCBot, etc.).
- **`llms.txt`** — the machine brief for AI crawlers/agents.
- **MCP server** at `POST /mcp` (Streamable HTTP) + **`server.json`** ready
  to submit to registries.
- **`openapi.json`** and **`/.well-known/ai-plugin.json`** for API
  directories and agent platforms.
- **x402 discoverability**: every paid route sets `discoverable: true`.

## 1. Google / search engines

1. Add `fetcher.cloud` to **Google Search Console** and **Bing Webmaster
   Tools**; verify via DNS (easy since DNS is on Cloudflare).
2. Submit `https://fetcher.cloud/sitemap.xml` in both.
3. Request indexing of the homepage.
4. Confirm rich results with Google's **Rich Results Test** (paste the URL —
   it should detect the FAQ + WebAPI schema).

## 2. MCP registries / directories

Submit the MCP server so agent clients can discover it. `server.json` is
ready — update the `repository.url` to your real repo first.

- **Official MCP Registry** (`registry.modelcontextprotocol.io`): publish
  with the `mcp-publisher` CLI. The `name` uses a reverse-DNS namespace —
  `cloud.fetcher/fetcher` — which you verify by adding a DNS TXT record on
  fetcher.cloud (or switch to `io.github.<you>/fetcher` for GitHub auth).
  *The registry's schema is still evolving — check the current field names
  at registry.modelcontextprotocol.io/docs before publishing.*
- **PulseMCP** (pulsemcp.com) — submit form; lists remote servers.
- **Smithery** (smithery.ai) — supports remote/hosted servers.
- **mcp.so** and **Glama** (glama.ai/mcp) — directory submissions.
- **Awesome MCP Servers** (GitHub) — open a PR adding fetcher under the
  relevant category.

Test before submitting: connect Claude Desktop / Cursor to
`https://api.fetcher.cloud/mcp` and confirm `tools/list` shows all four.

## 3. x402 ecosystem (agent payments)

- The **x402 Bazaar** indexes discoverable resources served through the CDP
  facilitator. `discoverable: true` is set on every paid route; listing
  typically follows your **first real settled payment** on mainnet. Run one
  live 402 → pay → retry to trigger it.
- Add fetcher to the community **`awesome-x402`** list (GitHub PR).
- Post the endpoints where agent devs gather (x402 Discord/community, and
  Coinbase Developer Platform showcase if applicable).

## 4. Agent-tool & API directories

- **There's An AI For That**, **Futurepedia**, **AI Agents Directory**,
  **Toolify** — submit as an "AI agent tool / API."
- **ProductHunt** launch (drives both humans and backlinks).
- **RapidAPI / APIs.guru** — list via `openapi.json`.
- Dev communities: a short **DEV.to** / **Hashnode** post ("tools your AI
  agent can't run itself") linking the docs ranks well for the long-tail
  keywords the site targets.

## 5. Keep it fresh

- Re-submit the sitemap after adding tools.
- Update `llms.txt`, `server.json`, and `openapi.json` whenever a tool or
  price changes (all are single-source-of-truth files).
- Watch Search Console queries to see which AI-related terms land, and lean
  into them in the copy.
