// src/lib/counter.js
//
// Backend-agnostic free-tier quota check, shared by the HTTP gate and the
// MCP server. Picks the best available counter:
//   1. Durable Object binding `COUNTER`  — preferred (high free ceiling,
//      strongly consistent). No KV-write cap.
//   2. KV binding `FREE_TIER_KV`          — fallback if no DO is configured.
//   3. neither                            — "no_backend"; caller decides
//      policy (the HTTP gate defers to the paywall; MCP allows the call).
//
// Returns: { state: "allowed" | "exhausted" | "no_backend", remaining }

export async function consumeQuota(env, toolName, ip, dailyLimit) {
  if (env.COUNTER) return consumeViaDO(env.COUNTER, toolName, ip, dailyLimit);
  if (env.FREE_TIER_KV) return consumeViaKV(env.FREE_TIER_KV, toolName, ip, dailyLimit);
  return { state: "no_backend", remaining: null };
}

async function consumeViaDO(binding, toolName, ip, dailyLimit) {
  // One global instance is ample at free-tier volume. To scale, replace
  // "global-v1" with a shard name derived from the ip.
  const id = binding.idFromName("global-v1");
  const stub = binding.get(id);
  try {
    const res = await stub.fetch("https://counter/consume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: `${toolName}:${ip}`, limit: dailyLimit }),
    });
    if (!res.ok) return { state: "no_backend", remaining: null };
    return await res.json();
  } catch {
    // If the DO is somehow unreachable, don't hard-fail the request — treat
    // as no backend so the caller applies its own policy.
    return { state: "no_backend", remaining: null };
  }
}

async function consumeViaKV(kv, toolName, ip, dailyLimit) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${toolName}:${ip}:${day}`;

  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count < dailyLimit) {
    // 2-day TTL so counters clear safely past the UTC day boundary.
    await kv.put(key, String(count + 1), { expirationTtl: 60 * 60 * 24 * 2 });
    return { state: "allowed", remaining: dailyLimit - count - 1 };
  }
  return { state: "exhausted", remaining: 0 };
}
