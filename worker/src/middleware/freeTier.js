// src/middleware/freeTier.js
//
// Hono middleware for the paid HTTP routes. Counting is delegated to
// lib/counter.js (Durable Object preferred, KV fallback). On a free request
// it calls the handler directly; when exhausted OR when no counter backend
// is configured it falls through to next() (the x402 paywall) — never
// granting silent unlimited free access.

import { consumeQuota } from "../lib/counter.js";

export function freeTierGate(toolName, dailyLimit, handler) {
  return async (c, next) => {
    // Opt-in: force the paid path (skip the free tier) via either the
    // `X-Force-Payment: true` header OR `?_forcepay=1` in the URL. The query
    // param is the reliable one for testing, since payment-wrapping clients
    // always preserve the URL but may drop custom headers.
    if (c.req.header("x-force-payment") === "true" || c.req.query("_forcepay") === "1") {
      return next();
    }

    const ip = c.req.header("cf-connecting-ip") || "anonymous";
    const { state, remaining } = await consumeQuota(c.env, toolName, ip, dailyLimit);

    if (state === "no_backend") {
      console.warn("[freeTierGate] no counter backend (COUNTER/FREE_TIER_KV) — deferring to paywall.");
      return next();
    }
    if (state === "allowed") {
      c.header("X-Free-Tier-Remaining", String(remaining));
      c.header("X-Payment-Required", "false");
      return handler(c);
    }
    c.header("X-Free-Tier-Remaining", "0");
    return next();
  };
}
