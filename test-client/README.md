# fetcher test client — pay on Base mainnet

Minimal script that pays a fetcher.cloud endpoint with **real USDC on Base**,
the same way an AI agent's wallet would. Amounts are sub-cent but real.

## What you need
- **Node.js 18+**
- A **Base wallet private key** (0x…) whose address holds a little **USDC on
  Base** (even $0.10 is plenty for many test calls). Keep a few cents of ETH
  on Base too, just in case gas is needed.
- Your fetcher API deployed (default targets `https://api.fetcher.cloud`).

## Run it
```bash
npm install

# PowerShell (Windows):
$env:PRIVATE_KEY = "0xYOUR_BASE_WALLET_KEY"
node pay.mjs

# or bash / macOS:
PRIVATE_KEY=0xYOUR_BASE_WALLET_KEY node pay.mjs
```

By default it hits the cheapest tool (`/qr`, $0.002) with an `X-Force-Payment`
header so it pays immediately instead of using the free tier. `/qr` is ideal
for a payment test because it uses no external services — if it returns 200,
you know the *payment rail itself* works.

Target a different endpoint by passing a URL:
```bash
node pay.mjs "https://api.fetcher.cloud/dns?host=example.com"
```

## What success looks like
```
← HTTP 200
✓ Payment settled: { "success": true, "transaction": "0x…", "network": "eip155:8453", ... }
← Response body: { "svg": "<svg …" , ... }
```
The `transaction` hash is your on-chain payment — you can look it up on BaseScan.

## Guardrails
- `MAX_USDC` (default 0.02 USDC) caps spend per call. Raise it for pricier
  tools: `MAX_USDC=50000 node pay.mjs "...url..."` (50000 = 0.05 USDC).
- Your key is only read from the env var; it's never printed or written to disk.

## If it fails on Solana
This client pays on **Base**. If your server advertises Solana and the
facilitator doesn't settle it, payments can error. Ship the server with
`PAYMENT_NETWORKS = ["base"]` (in `src/config.js`) until Solana is verified.
