// src/lib/robots.js — fetch and parse robots.txt; answer "can I crawl X?".
import { normalizeHost, timedFetch } from "./net.js";

export async function checkRobots(rawHost, { path = "/", userAgent = "*" } = {}) {
  const host = normalizeHost(rawHost);
  const robotsUrl = `https://${host}/robots.txt`;

  let res, body = "";
  try {
    res = await timedFetch(robotsUrl, { redirect: "follow" }, 7000);
    if (res.ok) body = await res.text();
  } catch {
    // fall through — no robots.txt means allowed
  }

  const groups = parseRobots(body);
  const sitemaps = [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);

  const group = groups[userAgent.toLowerCase()] || groups["*"] || { allow: [], disallow: [] };
  const allowed = isAllowed(path, group);

  return {
    host,
    robots_url: robotsUrl,
    has_robots: !!body,
    checked_at: new Date().toISOString(),
    query: { path, user_agent: userAgent },
    allowed,
    matched_rules: group,
    sitemaps,
    source: "robots.txt",
    summary: `${userAgent} is ${allowed ? "ALLOWED" : "DISALLOWED"} to crawl ${path} on ${host}.`,
  };
}

function parseRobots(text) {
  const groups = {};
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/#.*$/, "").trim();
    if (!l) continue;
    const [rawK, ...rest] = l.split(":");
    const k = rawK.toLowerCase().trim();
    const v = rest.join(":").trim();
    if (k === "user-agent") {
      const ua = v.toLowerCase();
      if (!groups[ua]) groups[ua] = { allow: [], disallow: [] };
      current = [groups[ua]];
    } else if (k === "disallow" && current.length) {
      current.forEach((g) => v && g.disallow.push(v));
      if (v === "") current.forEach((g) => (g.disallow = g.disallow)); // explicit allow-all
    } else if (k === "allow" && current.length) {
      current.forEach((g) => v && g.allow.push(v));
    }
  }
  return groups;
}

function isAllowed(path, group) {
  const match = (rules) => rules.filter((r) => path.startsWith(r)).sort((a, b) => b.length - a.length)[0];
  const dis = match(group.disallow);
  const allow = match(group.allow);
  if (!dis) return true;
  if (allow && allow.length >= dis.length) return true; // more specific allow wins
  return false;
}
