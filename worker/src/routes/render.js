// src/routes/render.js — thin Hono layer over lib/render.js
import { renderPage } from "../lib/render.js";

export async function renderHandler(c) {
  const url = c.req.query("url");
  const screenshot = c.req.query("screenshot") === "true";
  const fullPage = c.req.query("full_page") === "true";
  const waitUntil = c.req.query("wait_until");

  if (!url) {
    return c.json(
      { error: "missing_param", message: "Query param 'url' is required, e.g. ?url=example.com" },
      400
    );
  }

  try {
    const result = await renderPage(c.env, url, {
      screenshot,
      full_page: fullPage,
      wait_until: waitUntil,
    });
    return c.json(result);
  } catch (err) {
    switch (err.message) {
      case "missing_url":
      case "invalid_url":
        return c.json({ error: err.message, message: "Provide a valid http(s) URL." }, 400);
      case "render_not_configured":
        return c.json(
          {
            error: "render_not_configured",
            message:
              "Browser Rendering isn't enabled on this deployment. Add the `browser` binding in wrangler.jsonc and redeploy — see README.",
          },
          501
        );
      default:
        console.error("[/render] unexpected error:", err);
        return c.json(
          { error: "render_failed", message: "The page could not be rendered (navigation error or timeout)." },
          502
        );
    }
  }
}
