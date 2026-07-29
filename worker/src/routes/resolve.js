// src/routes/resolve.js — thin Hono layer over lib/resolve.js
import { resolveUrl } from "../lib/resolve.js";

export async function resolveHandler(c) {
  const url = c.req.query("url");
  const metadata = c.req.query("metadata") !== "false";

  if (!url) {
    return c.json(
      { error: "missing_param", message: "Query param 'url' is required, e.g. ?url=bit.ly/xyz" },
      400
    );
  }

  try {
    const result = await resolveUrl(url, { metadata });
    return c.json(result);
  } catch (err) {
    if (err.message === "missing_url" || err.message === "invalid_url") {
      return c.json(
        { error: err.message, message: "Provide a valid http(s) URL or bare hostname." },
        400
      );
    }
    console.error("[/resolve] unexpected error:", err);
    return c.json({ error: "resolve_failed", message: "Could not resolve the URL." }, 502);
  }
}
