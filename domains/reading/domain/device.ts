// The reading token: random, shown once, stored only as SHA-256. Pure functions, no IO.
import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");   // 256 bits
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}
