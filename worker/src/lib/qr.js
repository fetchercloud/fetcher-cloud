// src/lib/qr.js — generate a QR code (SVG) for text/URL.
// SVG output is pure-JS (no canvas), so it runs on Workers. Decoding a QR
// from an image needs pixel decoding and is a documented v2.
import QRCode from "qrcode";

export async function makeQr(data, { ecc = "M", margin = 2 } = {}) {
  const text = (data || "").trim();
  if (!text) throw new Error("missing_data");
  if (text.length > 2000) throw new Error("too_long");

  const level = ["L", "M", "Q", "H"].includes(String(ecc).toUpperCase()) ? String(ecc).toUpperCase() : "M";
  const svg = await QRCode.toString(text, { type: "svg", errorCorrectionLevel: level, margin });

  return {
    data: text,
    error_correction: level,
    svg,
    svg_data_uri: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
    generated_at: new Date().toISOString(),
    source: "qrcode",
    summary: `QR code generated for ${text.length > 48 ? text.slice(0, 48) + "…" : text}.`,
  };
}
