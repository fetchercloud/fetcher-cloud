# fetcher.cloud — x402-paid tools for AI agents (Cloudflare Workers)

The ghost that fetches what your AI can't. A set of small, sharp HTTP tools
that AI agents call and **pay for per request** in USDC — on **Base or
Solana** — via the [x402](https://github.com/coinbase/x402) protocol. No
accounts, no API keys; every tool has a free daily tier first.

Runs on **Cloudflare Workers** (Hono + KV). The marketing site lives in the
sibling `fetcher-site/` folder for Cloudflare Pages.

## The tools

| Route | Price | Free/day | What it does |
|-------|-------|----------|--------------|
| `GET /render` | $0.02 | 10 | Real Chromium render of JS-heavy pages → rendered HTML, text, optional screenshot |
| `GET /screenshot` | $0.02 | 10 | Screenshot of a page → base64 PNG/JPEG (lighter than /render) |
| `GET /extract` | $0.005 | 30 | Clean main content → Markdown + text, metadata, headings, links, reading time |
| `GET /unfurl` | $0.003 | 50 | Link preview card → title, description, image, favicon (OG/Twitter) |
| `GET /feed` | $0.003 | 40 | Discover + parse a site's RSS/Atom feed → JSON items |
| `GET /oembed` | $0.002 | 50 | Rich embed data for a media URL (YouTube, Vimeo, X, Spotify, TikTok…) |
| `GET /pdf-text` | $0.01 | 20 | Extract text + metadata from a PDF URL (text-based PDFs) |
| `GET /diff` | $0.008 | 25 | Compare two pages (or one vs its latest Wayback snapshot) |
| `GET /resolve` | $0.003 | 50 | Follow a URL's full redirect chain → final URL, every hop, landing metadata |
| `GET /headers` | $0.002 | 50 | HTTP response headers + security-header analysis with a score |
| `GET /robots` | $0.002 | 50 | Parse robots.txt → can a UA crawl a path? + sitemaps |
| `GET /favicon` | $0.002 | 50 | Find a site's best icon/logo |
| `GET /domain` | $0.004 | 50 | Real-time domain availability across TLDs via RDAP |
| `GET /domain/enriched` | $0.01 | 25 | + DNS (site/mail/SPF/DMARC), domain age, Wayback history |
| `GET /whois` | $0.005 | 40 | Deep registration record for one domain (RDAP) |
| `GET /dns` | $0.003 | 50 | Full DNS record dump (A/AAAA/MX/NS/TXT/SOA/CAA/CNAME) |
| `GET /ssl` | $0.004 | 40 | TLS cert issuer, expiry, SANs (via Certificate Transparency) |
| `GET /qr` | $0.002 | 50 | Generate a QR code (SVG) for text/URL |

**External-data notes (honest limits):** `/ssl` reads Certificate Transparency
logs (crt.sh), which show *issued* certs, not a live TLS handshake. `/render`
and `/screenshot` need Browser Rendering enabled (below).

`GET /` returns the machine-readable manifest (prices, schemas, free tiers).
`GET /docs` is the human version. Add `&format=text` to `/domain` for a table.

### Quick examples
```bash
curl "https://api.fetcher.cloud/render?url=app.example.com&screenshot=true"
curl "https://api.fetcher.cloud/extract?url=example.com/article&mode=markdown"
curl "https://api.fetcher.cloud/resolve?url=bit.ly/xyz"
curl "https://api.fetcher.cloud/domain/enriched?name=fetcher&tlds=com,io&format=text"
```

## Architecture

Per route: **manifest → free-tier gate → x402 paywall → handler.**

- **Hono**, not Express — Workers run on the V8 isolate runtime, and Hono is
  built for it (with official `@x402/hono` support).
- **Durable Object** for the free-tier counter — Workers are stateless
  isolates, so an in-memory Map can't track daily quota reliably. A DO is
  strongly consistent and, unlike KV, isn't subject to KV's ~1,000-writes/day
  Free-plan cap, so the free tier can stretch toward the Worker's full
  100k-requests/day budget. (KV is supported as an automatic fallback.)
- **Pure logic in `src/lib/`**, thin Hono handlers in `src/routes/`. Each
  lib file is payment- and framework-agnostic and independently testable.

```
src/
  index.js            # app, pricing table, x402 wiring, routes, manifest, docs
  middleware/freeTier.js
  lib/  rdap.js  enrich.js  format.js   # domain
        resolve.js  extract.js  html.js # links + content
        render.js                        # headless browser
  routes/ domain.js resolve.js extract.js render.js
```

## Payments: Base + Solana

Every paid route advertises **both** networks in its 402 `accepts` list, so a
paying agent uses whichever chain it holds USDC on. The resource server
registers both `ExactEvmScheme` (Base, `eip155:8453`) and `ExactSvmScheme`
(Solana, `solana:5eykt4…`).

The two receiving addresses are **public** (payments go *to* them), so they
live in plain config in `wrangler.jsonc` under `vars` — no secrets, no setup
command. They're already filled in; change them there to redirect payments:
```jsonc
"vars": {
  "PAYMENT_ADDRESS": "0x...your Base wallet...",
  "PAYMENT_ADDRESS_SOLANA": "...your Solana wallet..."
}
```

**Facilitator credentials (required for mainnet).** Coinbase's x402 facilitator
requires CDP API keys to settle real payments — without them, the first paid
request fails with `Facilitator getSupported failed (401): Unauthorized`.
Create a **Secret API Key** at the Coinbase Developer Platform
(portal.cdp.coinbase.com → API Keys), then set both as Worker **secrets**
(these are real secrets, unlike the wallet addresses):
```bash
wrangler secret put CDP_API_KEY_ID       # the key's ID
wrangler secret put CDP_API_KEY_SECRET   # the key's secret
```
The Worker reads these from `env` and passes them to the facilitator. Testnet
via a keyless facilitator doesn't need them, but Base **mainnet** does.

> **Verify Solana settlement before mainnet.** The code builds valid Solana
> payment *terms*, but whether they settle depends on the facilitator you
> point at (`@coinbase/x402`'s `facilitator`). Confirm the facilitator lists
> Solana support, and run one full 402 → pay → retry cycle on **devnet /
> Base Sepolia** before enabling real funds. If you only want Base for now,
> leave `PAYMENT_ADDRESS_SOLANA` as a placeholder — the Solana terms simply
> won't settle to a real wallet.

> **x402 is fast-moving** (v2.19.0 here). The scheme registration and
> `paymentMiddleware(routes, server, …)` signature were verified against the
> installed packages, not assumed. Re-verify on upgrade.

## One-time setup

```bash
npm install
npx wrangler login

# The free-tier counter is a Durable Object — created automatically on
# deploy via the migration in wrangler.jsonc. No manual step needed.

# Receiving wallets are already set in wrangler.jsonc (vars) — nothing to do.
# Change them there any time to redirect payments.
```

Run locally / deploy:
```bash
npx wrangler dev      # http://localhost:8787
npx wrangler deploy   # → https://fetcher-cloud.<subdomain>.workers.dev
```

## Enabling /render (Browser Rendering)

`/render` needs Cloudflare's **Browser Rendering** binding, which requires a
**Workers Paid plan** with the feature enabled. Until it's on, `/render`
returns a clean `501 render_not_configured` and every other tool works.

To enable: uncomment the `browser` binding in `wrangler.jsonc`:
```jsonc
"browser": { "binding": "BROWSER" }
```
then `npx wrangler deploy`. `@cloudflare/puppeteer` is already a dependency
and is imported lazily, so the rest of the Worker pays no cost for it.

## Deploying the landing site (Cloudflare Pages, free)

The `fetcher-site/` folder is a static site — deploy it separately on
**Cloudflare Pages** (free tier):
```bash
cd ../fetcher-site
npx wrangler pages deploy . --project-name fetcher-cloud
```
Recommended domain split:
- `fetcher.cloud` → the Pages site (marketing)
- `api.fetcher.cloud` → this Worker (the API + manifest + docs)

The site's links already point at `api.fetcher.cloud`. Set custom domains in
the Cloudflare dashboard once your DNS is on Cloudflare.

## Before real money moves

1. **Test on testnets** (Base Sepolia + Solana devnet) — full 402 → pay →
   retry cycle — before mainnet.
2. `wrangler secret list` to confirm both addresses are set.
3. Discovery: `discoverable: true` is set on every paid route; tools index
   after the first real settled payment through the facilitator.
4. Don't let Cloudflare Bot Fight Mode / WAF block the agent traffic you're
   trying to get paid by.

## Discovery — for people and agents

Built in and served live:
- `POST /mcp` — **MCP server** (Streamable HTTP, JSON-RPC 2.0). Connect Claude
  Desktop / Cursor / any MCP client to `https://api.fetcher.cloud/mcp`; it
  exposes `render_page`, `extract_content`, `resolve_url`, and `check_domain`.
  `GET /mcp` returns a friendly info payload.
- `GET /openapi.json` — OpenAPI 3.1 spec for API directories and codegen.
- `GET /.well-known/ai-plugin.json` — plugin manifest for agent platforms.
- `server.json` — ready to submit to MCP registries (edit the repo URL first).
- The site ships `llms.txt`, `robots.txt` (welcomes AI crawlers), `sitemap.xml`,
  JSON-LD (WebAPI + FAQ), and an `og.png` card.

**`DISCOVERY.md`** is the step-by-step checklist of *where to submit* once
deployed: Google/Bing, the MCP registries (official + PulseMCP, Smithery,
mcp.so, Glama), the x402 Bazaar, and AI-tool directories.

## Testing a real payment (mainnet)

The free tier normally covers testing, so to exercise the **paid** path on
purpose, send the header `X-Force-Payment: true` — it skips the free tier and
returns a 402 so a client actually pays. (Without it, calls are free until the
daily limit.)

The `fetcher-test-client` folder has a ready script that pays on Base mainnet
with real USDC, the way an agent's wallet would:
```bash
cd ../fetcher-test-client
npm install
PRIVATE_KEY=0xYourFundedBaseKey node pay.mjs      # hits the cheapest tool (/qr)
```
Success prints an on-chain transaction hash you can look up on BaseScan. Use a
wallet with a little USDC on Base; amounts are sub-cent and capped by `MAX_USDC`.

## Choosing payment networks

`src/config.js` has `PAYMENT_NETWORKS = ["base", "solana"]`. Every paid route
advertises exactly these. **If your facilitator doesn't settle Solana, listing
it can cause the facilitator to reject the whole 402 — including Base payers.**
So if a real payment errors on the Solana leg, set this to `["base"]` and
redeploy; Base keeps working. Verify Solana support with your facilitator
before relying on it.

> Note: the payment middleware fetches the facilitator's supported payment
> kinds on the first paid request (`syncFacilitatorOnStart` is on). That's a
> live network call to the facilitator — expected and required — so the very
> first paid request after a cold start is slightly slower.

## Documented v2 (honest gaps, not shipped half-working)

- **`/domain` sale price + trademark risk** — no reliable free source;
  needs a paid marketplace (GoDaddy appraisal, etc.) / legal API.
- **`/extract` OCR mode** for image/PDF URLs — needs an OCR engine
  (Cloudflare Workers AI binding or an external API). Currently `/extract`
  returns `415` for non-HTML content.

## Adding the next tool

Same three-step pattern: `src/lib/<tool>.js` (pure logic) → `src/routes/<tool>.js`
(thin handler) → add an entry to the `TOOLS` table in `src/index.js` and a
`mount(...)` line. Pricing, free tier, manifest, and paywall all read from
that one table.
