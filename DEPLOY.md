# fetcher.cloud — Deployment Guide

A start-to-finish guide to putting fetcher.cloud live on Cloudflare. Written
for Windows (PowerShell), but the commands are the same on macOS/Linux.

You have three folders (from the three zip files):

| Folder | What it is | Where it goes |
|---|---|---|
| `fetcher-cloud-workers` | The API — 18 tools + payments + MCP | Cloudflare **Workers** |
| `fetcher-site` | The landing page | Cloudflare **Pages** (free) |
| `fetcher-test-client` | A script to test a real payment | Runs on your PC |

Your Base and Solana wallet addresses are **already built in**, so there are no
secrets to set. Total time: about 15–20 minutes.

---

## Before you start (one-time)

### 1. Install Node.js
Download the **LTS** version from <https://nodejs.org> and install it (accept
the defaults). This gives you `node` and `npm`.

Verify it worked — open **PowerShell** and run:
```powershell
node --version
```
You should see something like `v20.x.x` or `v22.x.x`. If you get an error,
close and reopen PowerShell, or restart your PC.

### 2. Have a Cloudflare account
Sign up (free) at <https://dash.cloudflare.com/sign-up> if you don't have one.

### 3. Extract the three zip files
Right-click each zip → **Extract All**. Remember where you put them (e.g.
`C:\Users\You\Downloads\`).

---

## Part A — Deploy the API (the tools)

### Step 1. Open the API folder in PowerShell
In File Explorer, open the `fetcher-cloud-workers` folder, then click the
address bar, type `powershell`, and press Enter. (Or `cd` to it manually.)

You should now be "inside" the folder. Confirm with:
```powershell
dir
```
You should see `package.json`, `wrangler.jsonc`, and a `src` folder.

### Step 2. Install the code's dependencies
```powershell
npm install
```
This downloads the libraries the API needs. It takes a minute and creates a
`node_modules` folder. Some yellow warnings are normal; red errors are not.

### Step 3. Log in to Cloudflare
```powershell
npx wrangler login
```
Your browser opens — click **Allow**. When it says you're logged in, return to
PowerShell.

### Step 4. Deploy
```powershell
npx wrangler deploy
```
That's it. The free-tier counter (a Durable Object) is created automatically,
and your wallet addresses are already in the config.

**What success looks like:** it prints a URL like
`https://fetcher-cloud.YOUR-NAME.workers.dev`.

### Step 5. Check it's live
Open that URL in your browser — you'll see a JSON list of all 18 tools.
Add `/docs` to the end for the human-readable version. **Your API is live.** 🎉

---

## Part B — Deploy the landing page

### Step 1. Open the site folder in PowerShell
Same as before, but for the `fetcher-site` folder. (Or from the API folder:
`cd ..\fetcher-site`.)

### Step 2. Deploy to Cloudflare Pages
```powershell
npx wrangler pages deploy . --project-name fetcher-cloud
```
If it asks to create the project, say yes.

**What success looks like:** it prints a URL like
`https://fetcher-cloud.pages.dev`. Open it — you'll see the ghost landing
page. **Your site is live.** 🎉

---

## Part C — (Optional) Turn on the browser tools

Two tools — `/render` and `/screenshot` — need Cloudflare's **Browser
Rendering** switched on. Until then they return a tidy "not configured"
message and every other tool works. The Free plan includes about 10 minutes
of browser time per day.

To enable:
1. Open `fetcher-cloud-workers\wrangler.jsonc` in Notepad.
2. Find this line near the bottom (it's commented out):
   ```
   // "browser": { "binding": "BROWSER" }
   ```
   Remove the `//` so it reads:
   ```
   "browser": { "binding": "BROWSER" }
   ```
3. Save, then in the API folder run `npx wrangler deploy` again.

---

## Part D — (Optional) Use your own domain

If `fetcher.cloud` is your domain and its DNS is on Cloudflare, in the
Cloudflare dashboard:
- Point **`fetcher.cloud`** → the **Pages** project (the landing page).
- Point **`api.fetcher.cloud`** → the **Worker** (the API).

The site's links already expect the API at `api.fetcher.cloud`, so this makes
everything match. (Dashboard → your project → *Custom domains* → add.)

---

## Part E — Test a real payment (do this before going public)

Your addresses are wired in, but you should confirm the payment flow works
with a real, tiny payment first.

> **Strongly recommended: test Base first.** Open
> `fetcher-cloud-workers\src\config.js`, find:
> ```
> export const PAYMENT_NETWORKS = ["base", "solana"];
> ```
> Change it to `["base"]`, save, and `npx wrangler deploy` again. This makes
> the test use only Base (the proven path). You can add Solana back later
> once you've confirmed your facilitator settles it — see Part F.

### Step 1. Fund a Base wallet
Have a wallet (e.g. MetaMask set to Base network) with a little **USDC on
Base** — even $0.10 is plenty. Keep a few cents of ETH on Base too, just in
case. You'll need that wallet's **private key**.

### Step 2. Run the test client
Open the `fetcher-test-client` folder in PowerShell, then:
```powershell
npm install
$env:PRIVATE_KEY = "0xYOUR_BASE_WALLET_PRIVATE_KEY"
node pay.mjs "https://api.fetcher.cloud/qr?data=test"
```
(Replace the URL with your actual Workers URL if you're not using a custom
domain — e.g. `https://fetcher-cloud.YOUR-NAME.workers.dev/qr?data=test`.)

**What success looks like:**
```
← HTTP 200
✓ Payment settled: { "success": true, "transaction": "0x…", ... }
```
The `transaction` value is your on-chain payment — you can paste it into
<https://basescan.org> to see it. **Payments work.** 🎉

Your private key is only read from the env var — it's never shown or saved.

---

## Part F — Base only, or Base + Solana?

The `PAYMENT_NETWORKS` setting in `src/config.js` controls which chains you
accept:

- `["base"]` — Base only. Safest; proven.
- `["base", "solana"]` — both.

**Important:** only advertise Solana if your payment facilitator actually
settles it. If it doesn't, offering Solana can cause payments to fail *for
everyone, including Base*. So: launch with `["base"]`, confirm a real payment,
then add Solana and test again. If Solana payments error, remove it and
redeploy — Base keeps working.

---

## Troubleshooting

**`node` or `npm` "not recognized"** — Node.js isn't installed or PowerShell
needs restarting. Reinstall Node LTS, then open a fresh PowerShell window.

**`npx wrangler login` doesn't open a browser** — copy the URL it prints into
your browser manually.

**Deploy fails mentioning a Durable Object migration** — don't delete the
`durable_objects` or `migrations` sections in `wrangler.jsonc`; they must stay.

**A payment test errors** — usually one of: the wallet has no USDC on Base;
the amount exceeded the `MAX_USDC` cap (raise it: `$env:MAX_USDC="50000"`);
or the facilitator doesn't support the network (switch to `["base"]`).

**`/render` or `/screenshot` returns "not configured"** — that's expected
until you do Part C.

**A tool returns a 502 or timeout** — some tools call outside services (RDAP
registries, crt.sh for `/ssl`, archive.org for `/diff`); those can be briefly
slow. Retry.

---

## After launch — get discovered

Open `fetcher-cloud-workers\DISCOVERY.md` for the full checklist. The short
version:

1. **Google/Bing:** add your site to Google Search Console + Bing Webmaster
   Tools, and submit `https://fetcher.cloud/sitemap.xml`.
2. **MCP directories:** submit `server.json` (edit the repo URL first) to the
   MCP registries — registry.modelcontextprotocol.io, PulseMCP, Smithery,
   mcp.so, Glama. Test first by connecting Claude Desktop to
   `https://api.fetcher.cloud/mcp`.
3. **x402 Bazaar:** listing follows your first real settled payment.
4. **AI-tool directories:** There's An AI For That, Futurepedia, ProductHunt,
   and RapidAPI (via `openapi.json`).

---

## Command cheat sheet

```powershell
# API (from the fetcher-cloud-workers folder)
npm install
npx wrangler login
npx wrangler deploy

# Site (from the fetcher-site folder)
npx wrangler pages deploy . --project-name fetcher-cloud

# Test a payment (from the fetcher-test-client folder)
npm install
$env:PRIVATE_KEY = "0x..."
node pay.mjs "https://api.fetcher.cloud/qr?data=test"
```

To change anything later — prices, free limits, payment networks, wallet
addresses — edit `fetcher-cloud-workers\src\config.js` (or `wrangler.jsonc`
for addresses) and run `npx wrangler deploy` again.
