// src/lib/diff.js — compare two pages, or one page vs its Wayback snapshot.
import { normalizeUrl, timedFetch } from "./net.js";
import { extractReadable } from "./html.js";
import { diffLines } from "diff";

const MAX_CHARS = 120_000; // keep diff CPU-bounded

async function fetchText(url) {
  const res = await timedFetch(url, { redirect: "follow", headers: { Accept: "text/html,*/*" } }, 9000);
  if (!res.ok) { const e = new Error("upstream_status"); e.status = res.status; e.url = url; throw e; }
  const html = (await res.text()).slice(0, 800_000);
  return { finalUrl: res.url || url, text: extractReadable(html, res.url || url).text.slice(0, MAX_CHARS) };
}

async function waybackSnapshot(url) {
  try {
    const res = await timedFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {}, 7000);
    if (!res.ok) return null;
    const d = await res.json();
    const c = d?.archived_snapshots?.closest;
    return c?.available ? { url: c.url, timestamp: c.timestamp } : null;
  } catch { return null; }
}

export async function diffPages({ url_a, url_b } = {}) {
  const a = normalizeUrl(url_a);

  let leftLabel, left, rightLabel, right;
  if (url_b) {
    // Compare A (old/left) vs B (new/right).
    const [ra, rb] = await Promise.all([fetchText(a), fetchText(normalizeUrl(url_b))]);
    leftLabel = ra.finalUrl; left = ra.text;
    rightLabel = rb.finalUrl; right = rb.text;
  } else {
    // Compare latest Wayback snapshot (old) vs current (new).
    const snap = await waybackSnapshot(a);
    if (!snap) throw new Error("no_snapshot");
    const [rOld, rNew] = await Promise.all([fetchText(snap.url), fetchText(a)]);
    leftLabel = `Wayback ${snap.timestamp?.slice(0, 8) || ""}`.trim(); left = rOld.text;
    rightLabel = rNew.finalUrl; right = rNew.text;
  }

  const parts = diffLines(left, right);
  const added = [], removed = [];
  let unchanged = 0;
  for (const p of parts) {
    const lines = p.value.split("\n").filter((l) => l.trim());
    if (p.added) added.push(...lines);
    else if (p.removed) removed.push(...lines);
    else unchanged += lines.length;
  }
  const total = unchanged + added.length + removed.length;
  const similarity = total ? Math.round((unchanged / total) * 100) : 100;

  return {
    left: leftLabel,
    right: rightLabel,
    compared_at: new Date().toISOString(),
    changed: added.length > 0 || removed.length > 0,
    similarity_percent: similarity,
    added_lines: added.slice(0, 200),
    removed_lines: removed.slice(0, 200),
    counts: { added: added.length, removed: removed.length, unchanged },
    source: "readable-text line diff",
    summary: added.length || removed.length
      ? `${added.length} added, ${removed.length} removed line(s); ${similarity}% unchanged.`
      : `No textual changes detected (${similarity}% identical).`,
  };
}
