// pay.mjs — pay a fetcher.cloud endpoint on Base mainnet, with full diagnostics.
// Prints exactly what happens at each step so nothing fails silently.

import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { base } from "viem/chains";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY first:  $env:PRIVATE_KEY='0x...'; node pay.mjs");
  process.exit(1);
}

// Target, forced onto the paid path via the URL param the client preserves.
let target = process.argv[2] || "https://api.fetcher.cloud/qr?data=hello-from-my-agent";
const tu = new globalThis.URL(target);
tu.searchParams.set("_forcepay", "1");
target = tu.toString();

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http() });

console.log("Wallet :", account.address);
console.log("Target :", target, "\n");

// ── Step 1: check the wallet actually has funds on Base ─────────────────────
try {
  const [usdc, eth] = await Promise.all([
    publicClient.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    publicClient.getBalance({ address: account.address }),
  ]);
  console.log("USDC on Base:", formatUnits(usdc, 6));
  console.log("ETH  on Base:", formatUnits(eth, 18));
  if (usdc === 0n) {
    console.error("\n✗ This wallet holds 0 USDC on Base. Send it a little USDC (Base network) and retry.");
    process.exit(1);
  }
} catch (e) {
  console.error("\n✗ Couldn't read balances from Base RPC:", e.shortMessage || e.message);
  console.error("  (Check internet; then retry.)");
  process.exit(1);
}

// ── Step 2: show the raw 402 so we can SEE the payment terms ────────────────
console.log("\n── Step 2: fetching payment terms ──");
const probe = await fetch(target);
console.log("First response:", probe.status, probe.status === 402 ? "402 Payment Required ✓" : "(expected 402!)");
const terms = await probe.clone().json().catch(() => null);
if (terms?.accepts?.length) {
  for (const a of terms.accepts) {
    console.log("  network:", a.network, "| amount:", a.maxAmountRequired || a.amount, "| asset:", a.asset, "| payTo:", a.payTo);
  }
} else {
  console.log("  (no 'accepts' in body — raw:", JSON.stringify(terms).slice(0, 200), ")");
}

// ── Step 3: pay + retry ─────────────────────────────────────────────────────
console.log("\n── Step 3: signing + paying ──");
const signer = toClientEvmSigner(account, publicClient);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(signer));
const payFetch = wrapFetchWithPayment(fetch, client);

try {
  const res = await payFetch(target);
  console.log("Final response:", res.status);
  const h = res.headers.get("x-payment-response") || res.headers.get("payment-response");
  if (h) {
    const s = decodePaymentResponseHeader(h);
    console.log("\n✓✓ PAID. Settlement:", JSON.stringify(s));
    if (s.transaction) console.log("  BaseScan: https://basescan.org/tx/" + s.transaction);
  } else {
    const body = await res.text();
    console.log("No settlement header found. Response body:\n", body.slice(0, 400));
  }
} catch (e) {
  console.error("\n✗ Payment failed:", e.message);
  if (e.cause) console.error("  cause:", e.cause.message || e.cause);
}
