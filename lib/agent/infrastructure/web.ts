// Plain HTTP fetches for the agent (design doc: "using a browser when
// needed" — Phase 0 uses a text fetch, counted as a page). Generic user
// agent; nothing about the family is sent.
import { imageSize } from "../domain/image";
import { pageText, type PageText } from "../domain/html";

const UA = "Mozilla/5.0 (compatible; MapPal/0.2; family travel app)";
const MAX_PAGE = 2_000_000;
const MAX_IMAGE = 3_000_000;

export function safeUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("only http(s) links");
  // No local/internal hosts (the server runs next to other services).
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\]|metadata)/i.test(u.hostname) || !u.hostname.includes(".")) {
    throw new Error("internal addresses are not fetched");
  }
  return u;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error(`larger than ${Math.round(max / 1e6)} MB`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function fetchPage(raw: string, maxChars = 10000): Promise<PageText & { url: string; contentType: string }> {
  const url = safeUrl(raw);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (/pdf/i.test(contentType)) return { url: res.url, contentType, text: "(PDF — not read; use fetch_image only for image menus)", truncated: false, menuLinks: [], images: [] };
  if (/^image\//i.test(contentType)) return { url: res.url, contentType, text: "(an image — use fetch_image)", truncated: false, menuLinks: [], images: [{ url: res.url, menu: true }] };
  const bytes = await readCapped(res, MAX_PAGE);
  const html = new TextDecoder(/charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8", { fatal: false }).decode(bytes);
  return { url: res.url, contentType, ...pageText(html, res.url, maxChars) };
}

export interface FetchedImage {
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export async function fetchImage(raw: string): Promise<FetchedImage> {
  const url = safeUrl(raw);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(jpeg|png|gif|webp)$/.test(mimeType)) throw new Error(`not a supported image (${mimeType || "no type"})`);
  const bytes = await readCapped(res, MAX_IMAGE);
  return fromBytes(bytes, mimeType);
}

export function fromBytes(bytes: Uint8Array, mimeType: string): FetchedImage {
  const size = imageSize(bytes);
  return { base64: Buffer.from(bytes).toString("base64"), mimeType, width: size?.width, height: size?.height };
}
