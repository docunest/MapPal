// Stable fingerprints for brief layers: same content → same hash, always.
import { createHash } from "node:crypto";

export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const shortHash = (...parts: unknown[]) => createHash("sha256").update(parts.map((p) => (typeof p === "string" ? p : stableJson(p))).join("\u0000")).digest("hex").slice(0, 12);
