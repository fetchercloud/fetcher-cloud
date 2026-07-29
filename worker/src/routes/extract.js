// src/routes/extract.js — thin Hono layer over lib/extract.js
import { extractContent } from "../lib/extract.js";

const VALID_MODES = new Set(["markdown", "text", "full"]);

export async function extractHandler(c) {
  const url = c.req.query("url");
  const mode = c.req.query("mode") || "full";

  if (!url) {
    return c.json(
      { error: "missing_param", message: "Query param 'url' is required, e.g. ?url=example.com/article" },
      400
    );
  }
  if (!VALID_MODES.has(mode)) {
    return c.json(
      { error: "invalid_mode", message: "mode must be one of: markdown, text, full." },
      400
    );
  }

  try {
    const result = await extractContent(url, { mode });
    return c.json(result);
  } catch (err) {
    switch (err.message) {
      case "missing_url":
      case "invalid_url":
        return c.json({ error: err.message, message: "Provide a valid http(s) URL." }, 400);
      case "timeout":
        return c.json({ error: "timeout", message: "The page took too long to fetch." }, 504);
      case "upstream_status":
        return c.json(
          { error: "upstream_status", message: `Upstream returned HTTP ${err.status}.`, status: err.status },
          502
        );
      case "unsupported_content_type":
        return c.json(
          {
            error: "unsupported_content_type",
            message: `Can only extract HTML pages; got ${err.contentType || "unknown"}. OCR for images/PDFs is a documented v2 — see docs.`,
          },
          415
        );
      default:
        console.error("[/extract] unexpected error:", err);
        return c.json({ error: "extract_failed", message: "Could not extract content." }, 502);
    }
  }
}
