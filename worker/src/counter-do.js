// src/counter-do.js
//
// Durable Object that holds the daily free-tier counters. This replaces the
// KV-based counter to get past KV's ~1,000-writes/day Free-plan cap — a
// Durable Object's storage isn't billed per write that way, so the free
// tier can stretch to roughly the Worker's whole 100k-requests/day budget.
//
// It's also strongly consistent (KV was eventually consistent), so counts
// are exact right at the limit boundary.
//
// One global instance handles all counters, which is plenty at free-tier
// volume (<=~1 req/sec). If you ever need more throughput, shard by hashing
// the IP into N named instances — see consumeViaDO in lib/counter.js.

export class FreeTierCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ state: "no_backend", remaining: null }, { status: 400 });
    }

    const { key, limit } = body;
    const today = new Date().toISOString().slice(0, 10);

    // Read-modify-write is serialized per Durable Object, so this is atomic.
    const rec = (await this.state.storage.get(key)) || { day: today, count: 0 };
    if (rec.day !== today) {
      rec.day = today;
      rec.count = 0;
    }

    if (rec.count < limit) {
      rec.count += 1;
      await this.state.storage.put(key, rec);
      return Response.json({ state: "allowed", remaining: limit - rec.count });
    }

    return Response.json({ state: "exhausted", remaining: 0 });
  }
}
