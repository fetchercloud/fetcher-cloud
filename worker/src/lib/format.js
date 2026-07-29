// src/lib/format.js
//
// Turns the machine-readable checkDomain() result into a plain-text table
// for humans testing the endpoint directly (curl, browser, etc). Agents
// should keep using the default JSON response — this is purely for
// eyeballing results quickly.

/**
 * @param {Object} result - the object returned by checkDomain()
 * @returns {string} plain-text table
 */
export function formatDomainResultsAsText(result) {
  const lines = [];
  lines.push(`Domain check: "${result.query}"`);
  lines.push(`Checked at:   ${result.checked_at}`);
  lines.push("");

  const rows = result.results.map((r) => {
    const icon =
      r.available === true ? "✅ available" : r.available === false ? "❌ taken" : "⚠️  unknown";
    return { domain: r.domain, icon, detail: r.summary || r.note || "" };
  });

  const domainWidth = Math.max(...rows.map((r) => r.domain.length), "DOMAIN".length);
  const statusWidth = Math.max(...rows.map((r) => r.icon.length), "STATUS".length);

  const pad = (str, width) => str + " ".repeat(Math.max(0, width - str.length));

  lines.push(`${pad("DOMAIN", domainWidth)}  ${pad("STATUS", statusWidth)}  DETAIL`);
  lines.push("-".repeat(domainWidth + statusWidth + 40));

  for (const row of rows) {
    lines.push(`${pad(row.domain, domainWidth)}  ${pad(row.icon, statusWidth)}  ${row.detail}`);
  }

  // If this was an enriched lookup, print a details block per domain that
  // actually has enrichment attached.
  if (result.enriched) {
    for (const r of result.results) {
      if (!r.enrichment) continue;
      lines.push("");
      lines.push(`── ${r.domain} ──`);
      appendEnrichmentLines(lines, r.enrichment);
    }
  }

  lines.push("");
  lines.push(`Source: ${result.source}`);

  return lines.join("\n");
}

function appendEnrichmentLines(lines, e) {
  if (e.age) {
    lines.push(`  Age:      ${e.age.age_years} yrs (registered ${e.age.created_readable})`);
  }
  if (e.dns) {
    lines.push(`  Website:  ${e.dns.has_website ? "yes — resolves to a host" : "no A/AAAA record"}`);
    lines.push(`  Mail:     ${e.dns.has_mail ? "configured (MX present)" : "none"}`);
    if (e.dns.nameservers?.length) {
      lines.push(`  NS:       ${e.dns.nameservers.slice(0, 4).join(", ")}`);
    }
    const trust = [];
    if (e.dns.has_spf) trust.push("SPF");
    if (e.dns.has_dmarc) trust.push("DMARC");
    if (trust.length) lines.push(`  Email auth: ${trust.join(" + ")}`);
  }
  if (e.history) {
    if (e.history.archived) {
      const first = e.history.first_snapshot ? `first seen ${e.history.first_snapshot}` : "archived";
      lines.push(`  History:  ${first} in the Wayback Machine`);
    } else {
      lines.push(`  History:  no Wayback Machine snapshots found`);
    }
  }
  if (e.previously_used !== undefined && !e.dns) {
    lines.push(
      `  Note:     ${
        e.previously_used
          ? "this available domain was previously a live, archived site"
          : "no prior archived history found"
      }`
    );
  }
}
