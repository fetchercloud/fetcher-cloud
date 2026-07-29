// src/config.js
//
// Single source of truth for the tool catalog: pricing, free-tier
// allowances, and descriptions. The manifest, the x402 paywall, the docs,
// and the MCP server all read from here so numbers can never drift apart.
//
// Free tiers were deliberately set conservative (about half of the original
// figures) — the free tier exists to let agents *try* a tool, not to run
// production volume for free. Paid, per-call x402 usage is the intended path
// past it.

export const TOOLS = {
  domain: {
    path: "/domain",
    price: "$0.004",
    freePerDay: 50,
    description:
      "Real-time domain availability across TLDs via RDAP. Returns availability, registrar, expiry, and status.",
  },
  domain_enriched: {
    path: "/domain/enriched",
    price: "$0.01",
    freePerDay: 25,
    description:
      "Domain availability plus DNS (live site / mail / SPF / DMARC), domain age, and Wayback Machine history — for vetting a domain before buying.",
  },
  resolve: {
    path: "/resolve",
    price: "$0.003",
    freePerDay: 50,
    description:
      "Follow a URL's full redirect chain and return the final destination, every hop, and final-page metadata. Unwraps short links, tracking URLs, and redirectors.",
  },
  extract: {
    path: "/extract",
    price: "$0.005",
    freePerDay: 30,
    description:
      "Clean content extraction — returns a page's main article as Markdown + text with metadata, headings, links, and reading time. Boilerplate stripped. Built for RAG / agent ingestion.",
  },
  render: {
    path: "/render",
    price: "$0.02",
    freePerDay: 10,
    description:
      "Full headless-browser render (real Chromium) of JavaScript-heavy pages. Returns fully-rendered HTML, visible text, and optional screenshot — the thing plain fetch() can't do.",
  },
  screenshot: {
    path: "/screenshot",
    price: "$0.02",
    freePerDay: 10,
    description:
      "Screenshot of a page (real Chromium) as a base64 PNG/JPEG. Lighter than /render when you only need the image.",
  },
  unfurl: {
    path: "/unfurl",
    price: "$0.003",
    freePerDay: 50,
    description:
      "Link preview card for any URL — title, description, image, site name, favicon (OpenGraph/Twitter).",
  },
  feed: {
    path: "/feed",
    price: "$0.003",
    freePerDay: 40,
    description:
      "Discover and parse a site's RSS/Atom feed into clean JSON items (title, link, date, summary).",
  },
  oembed: {
    path: "/oembed",
    price: "$0.002",
    freePerDay: 50,
    description:
      "Rich embed data (oEmbed) for a media URL — YouTube, Vimeo, Twitter/X, Spotify, TikTok, SoundCloud, and more.",
  },
  favicon: {
    path: "/favicon",
    price: "$0.002",
    freePerDay: 50,
    description:
      "Find a site's best icon/logo — declared <link> icons, apple-touch-icon, og:image, with fallbacks.",
  },
  robots: {
    path: "/robots",
    price: "$0.002",
    freePerDay: 50,
    description:
      "Fetch and parse robots.txt; answer whether a given user-agent may crawl a given path, and list sitemaps.",
  },
  headers: {
    path: "/headers",
    price: "$0.002",
    freePerDay: 50,
    description:
      "Return a URL's HTTP response headers plus a security-header analysis (HSTS, CSP, X-Frame-Options, etc.) with a score.",
  },
  dns: {
    path: "/dns",
    price: "$0.003",
    freePerDay: 50,
    description:
      "Full DNS record dump for a hostname (A, AAAA, MX, NS, TXT, SOA, CAA, CNAME) with quick signals.",
  },
  ssl: {
    path: "/ssl",
    price: "$0.004",
    freePerDay: 40,
    description:
      "TLS certificate details for a host via Certificate Transparency logs — issuer, validity window, days-to-expiry, and SANs.",
  },
  whois: {
    path: "/whois",
    price: "$0.005",
    freePerDay: 40,
    description:
      "Deep registration record for one domain (via RDAP) — registrar, dates, statuses, nameservers, DNSSEC.",
  },
  pdftext: {
    path: "/pdf-text",
    price: "$0.01",
    freePerDay: 20,
    description:
      "Extract text + metadata from a PDF URL (text-based PDFs). Agents can't open binaries; scanned-PDF OCR is a documented v2.",
  },
  qr: {
    path: "/qr",
    price: "$0.002",
    freePerDay: 50,
    description:
      "Generate a QR code (SVG) for any text or URL, with selectable error-correction.",
  },
  diff: {
    path: "/diff",
    price: "$0.008",
    freePerDay: 25,
    description:
      "Compare two pages (or one page vs its latest Wayback snapshot) and return what changed, with a similarity score.",
  },
};

// Which networks to advertise in payment terms. If your x402 facilitator
// doesn't settle Solana, set this to ["base"] and redeploy — listing an
// unsupported network can cause the facilitator to reject the whole 402.
// Base is the safe default; Solana is included per configuration.
export const PAYMENT_NETWORKS = ["base"]; // add "solana" once you confirm your facilitator settles it: ["base", "solana"]

export const FREE_LIMITS = Object.fromEntries(
  Object.entries(TOOLS).map(([k, t]) => [k, t.freePerDay])
);

// Enrichment fans out many subrequests per domain (RDAP + DNS + DMARC +
// archive). Cloudflare's Free plan caps a single request at 50 subrequests,
// so /domain/enriched uses a small default TLD set and a hard cap that keeps
// a worst-case (all-taken) lookup safely under that ceiling.
//   ~ 1 bootstrap + N×(1 RDAP + 8 enrichment) → N=5 ⇒ ~46 subrequests.
export const ENRICHED_DEFAULT_TLDS = ["com", "io", "ai", "co"];
export const ENRICHED_MAX_TLDS = 5;

// Capability metadata for /capabilities and MCP (generated, single-source).
export const CATEGORY = {
  render: "browser", screenshot: "browser",
  extract: "content", unfurl: "content", feed: "content", oembed: "content", pdftext: "content", diff: "content",
  resolve: "web-intel", headers: "web-intel", robots: "web-intel", favicon: "web-intel",
  domain: "domain-dns", domain_enriched: "domain-dns", whois: "domain-dns", dns: "domain-dns", ssl: "domain-dns",
  qr: "utility",
};
export const CATEGORY_LABELS = {
  "browser": "Browser & rendering",
  "content": "Content & extraction",
  "web-intel": "Web intelligence",
  "domain-dns": "Domain & DNS",
  "utility": "Utility",
};
// Example query string per tool (appended to the tool path).
export const EXAMPLE = {
  domain: "?name=fetcher&tlds=com,io,ai",
  domain_enriched: "?name=fetcher&tlds=com,io",
  resolve: "?url=bit.ly/xyz",
  extract: "?url=example.com/article&mode=markdown",
  render: "?url=example.com&screenshot=true",
  screenshot: "?url=example.com&full_page=true",
  unfurl: "?url=example.com/page",
  feed: "?url=example.com",
  oembed: "?url=https://youtu.be/dQw4w9WgXcQ",
  favicon: "?host=example.com",
  robots: "?host=example.com&path=/admin",
  headers: "?url=example.com",
  dns: "?host=example.com",
  ssl: "?host=example.com",
  whois: "?domain=example.com",
  pdftext: "?url=example.com/report.pdf",
  qr: "?data=hello-agent",
  diff: "?url_a=example.com",
};
