// src/lib/html.js
//
// Shared HTML parsing used by /resolve and /extract. Uses node-html-parser
// (pure JS, runs identically on Workers and Node) rather than a headless
// browser — no JS execution, just static DOM parsing. For JS-rendered
// pages, callers should route through /render first.

import { parse } from "node-html-parser";

/** Resolve a possibly-relative URL against a base; return null on failure. */
function absolutize(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function metaContent(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const c = el?.getAttribute("content");
    if (c) return c.trim();
  }
  return null;
}

/**
 * Pull page-level metadata: title, description, canonical URL, favicon,
 * OpenGraph, Twitter card, author, published date, language.
 */
export function parseMetadata(html, baseUrl) {
  const root = parse(html, { comment: false });

  const title =
    metaContent(root, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    root.querySelector("title")?.text?.trim() ||
    null;

  const description = metaContent(root, [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]);

  const canonicalHref = root.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const canonical = absolutize(canonicalHref, baseUrl);

  const iconHref =
    root.querySelector('link[rel="icon"]')?.getAttribute("href") ||
    root.querySelector('link[rel="shortcut icon"]')?.getAttribute("href") ||
    root.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ||
    "/favicon.ico";
  const favicon = absolutize(iconHref, baseUrl);

  const image = absolutize(
    metaContent(root, ['meta[property="og:image"]', 'meta[name="twitter:image"]']),
    baseUrl
  );

  const author = metaContent(root, [
    'meta[name="author"]',
    'meta[property="article:author"]',
  ]);

  const published = metaContent(root, [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
  ]);

  const siteName = metaContent(root, ['meta[property="og:site_name"]']);
  const type = metaContent(root, ['meta[property="og:type"]']);
  const lang = root.querySelector("html")?.getAttribute("lang") || null;

  return {
    title,
    description,
    canonical,
    favicon,
    image,
    author,
    published,
    site_name: siteName,
    type,
    lang,
  };
}

// Elements whose content is boilerplate/chrome, not article content.
const STRIP_TAGS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "svg",
  "button",
];

/**
 * Extract the main readable content of a page as clean text + a lightweight
 * Markdown rendering, plus headings, links, images and reading-time stats.
 *
 * Heuristic (not a full Readability port, but robust and cheap): prefer
 * <article> or <main>; fall back to the <body>; strip known boilerplate
 * tags first. Good enough for articles, docs, blog posts, and product pages.
 */
export function extractReadable(html, baseUrl) {
  const root = parse(html, { comment: false });

  root.querySelectorAll(STRIP_TAGS.join(",")).forEach((el) => el.remove());

  const container =
    root.querySelector("article") ||
    root.querySelector("main") ||
    root.querySelector('[role="main"]') ||
    root.querySelector("body") ||
    root;

  // Headings (for structure / outline).
  const headings = container.querySelectorAll("h1,h2,h3").map((h) => ({
    level: Number(h.tagName.slice(1)),
    text: collapse(h.text),
  }));

  // Links and images, absolutized.
  const links = dedupe(
    container.querySelectorAll("a[href]").map((a) => ({
      text: collapse(a.text),
      href: absolutize(a.getAttribute("href"), baseUrl),
    }))
  ).filter((l) => l.href && !l.href.startsWith("javascript:"));

  const images = dedupe(
    container.querySelectorAll("img[src]").map((img) => ({
      alt: img.getAttribute("alt") || null,
      src: absolutize(img.getAttribute("src"), baseUrl),
    }))
  ).filter((i) => i.src);

  // Block-level Markdown rendering.
  const markdown = toMarkdown(container, baseUrl);
  const text = collapse(container.text);

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return {
    headings,
    links,
    images,
    markdown,
    text,
    word_count: words,
    reading_time_min: Math.max(1, Math.round(words / 220)),
  };
}

function collapse(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * Minimal, dependency-free block-to-Markdown conversion. Walks the direct
 * block structure and renders the common elements agents actually want:
 * headings, paragraphs, list items, blockquotes, links, and code.
 */
function toMarkdown(container, baseUrl) {
  const out = [];

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) continue; // handled inline by parents below
      const tag = child.tagName?.toLowerCase();
      if (!tag) continue;

      switch (tag) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const level = Number(tag.slice(1));
          out.push(`${"#".repeat(level)} ${collapse(child.text)}`);
          break;
        }
        case "p":
          out.push(inline(child, baseUrl));
          break;
        case "li":
          out.push(`- ${inline(child, baseUrl)}`);
          break;
        case "blockquote":
          out.push(`> ${collapse(child.text)}`);
          break;
        case "pre":
        case "code":
          out.push("```\n" + child.text.trim() + "\n```");
          break;
        case "ul":
        case "ol":
        case "div":
        case "section":
          walk(child); // recurse into containers
          break;
        default:
          if (collapse(child.text)) out.push(inline(child, baseUrl));
      }
    }
  };

  walk(container);
  return out.filter(Boolean).join("\n\n");
}

function inline(node, baseUrl) {
  // Render links inline as [text](href); everything else as its text.
  let s = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      s += child.text;
    } else if (child.tagName?.toLowerCase() === "a") {
      const href = absolutize(child.getAttribute("href"), baseUrl);
      const text = collapse(child.text);
      s += href && text ? `[${text}](${href})` : text;
    } else {
      s += child.text;
    }
  }
  return collapse(s);
}
