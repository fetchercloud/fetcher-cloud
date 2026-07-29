// src/routes/domain.js
//
// Thin HTTP layer for Hono. Both the base and enriched endpoints share one
// core (`runDomainCheck`) and differ only by whether enrichment runs — this
// is the "shared core, forced enrich behavior" split so the two priced
// routes can never drift apart in validation or formatting.

import { checkDomain, DEFAULT_TLDS } from "../lib/rdap.js";
import { enrichResults } from "../lib/enrich.js";
import { formatDomainResultsAsText } from "../lib/format.js";
import { ENRICHED_DEFAULT_TLDS, ENRICHED_MAX_TLDS } from "../config.js";

async function runDomainCheck(c, { enrich }) {
  const name = c.req.query("name");
  const tlds = c.req.query("tlds");
  const format = c.req.query("format");

  if (!name) {
    return c.json(
      {
        error: "missing_param",
        message: "Query param 'name' is required, e.g. ?name=fetcher",
      },
      400
    );
  }

  const tldList = tlds
    ? tlds
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : enrich
    ? ENRICHED_DEFAULT_TLDS
    : DEFAULT_TLDS;

  // Enrichment fans out many subrequests per domain; cap it low enough to
  // stay under Cloudflare's Free-plan 50-subrequests-per-request limit.
  const maxTlds = enrich ? ENRICHED_MAX_TLDS : 20;
  if (tldList.length > maxTlds) {
    return c.json(
      {
        error: "too_many_tlds",
        message: enrich
          ? `Max ${ENRICHED_MAX_TLDS} TLDs for enriched lookups (each does DNS + archive checks). Split into multiple calls for more.`
          : "Max 20 TLDs per request.",
      },
      400
    );
  }

  // JSON is always the default. format=text is opt-in only, for humans
  // testing directly — never inferred from headers. An M2M paid endpoint
  // must never guess response format.
  const wantsText = format === "text";

  try {
    let result = await checkDomain(name, tldList);
    if (enrich) {
      result = await enrichResults(result);
    }
    if (wantsText) {
      return c.text(formatDomainResultsAsText(result));
    }
    return c.json(result);
  } catch (err) {
    if (err.message === "invalid_domain_label") {
      return c.json(
        {
          error: "invalid_domain_label",
          message: "Domain label must be alphanumeric/hyphen only, no TLD, no dots.",
        },
        400
      );
    }
    console.error("[/domain] unexpected error:", err);
    return c.json({ error: "upstream_error", message: "RDAP lookup failed." }, 502);
  }
}

// Base availability only — cheapest call.
export const domainHandler = (c) => runDomainCheck(c, { enrich: false });

// Availability + DNS, domain age, and Wayback history. Priced higher; does
// more upstream work per domain.
export const domainEnrichedHandler = (c) => runDomainCheck(c, { enrich: true });
