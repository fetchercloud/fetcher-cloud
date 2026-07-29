// src/lib/pdftext.js — extract text + metadata from a PDF URL.
// Uses unpdf (pdf.js built for serverless/edge runtimes). Handles text-based
// PDFs; scanned/image PDFs need OCR (documented v2).
import { normalizeUrl, timedFetch } from "./net.js";

const MAX_BYTES = 15_000_000;

export async function extractPdf(rawUrl, { max_pages = 0 } = {}) {
  const url = normalizeUrl(rawUrl);
  const res = await timedFetch(url, { redirect: "follow", headers: { Accept: "application/pdf,*/*" } }, 12000);
  if (!res.ok) { const e = new Error("upstream_status"); e.status = res.status; throw e; }

  const ct = res.headers.get("content-type") || "";
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error("too_large");
  const bytes = new Uint8Array(buf);

  // Sniff the %PDF- magic so we give a clear error on non-PDFs.
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  if (!ct.includes("pdf") && magic !== "%PDF-") throw new Error("not_a_pdf");

  const { extractText, getMeta, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });

  let meta = null;
  try { const m = await getMeta(pdf); meta = m?.info || null; } catch { /* ignore */ }

  let out = text;
  if (max_pages > 0) out = out.split("\f").slice(0, max_pages).join("\f");
  out = out.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();

  const words = out ? out.split(/\s+/).filter(Boolean).length : 0;
  return {
    query: url,
    extracted_at: new Date().toISOString(),
    pages: totalPages,
    title: meta?.Title || null,
    author: meta?.Author || null,
    word_count: words,
    text: out,
    note: words === 0 ? "No embedded text found — this may be a scanned/image PDF (OCR is a documented v2)." : undefined,
    source: "unpdf (pdf.js)",
    summary: `Extracted ${words} words from ${totalPages}-page PDF${meta?.Title ? ` "${meta.Title}"` : ""}.`,
  };
}
