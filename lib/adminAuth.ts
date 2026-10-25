import { timingSafeEqual } from "node:crypto";

/** x-admin-secret header vs ADMIN_SEED_SECRET (same scheme as the other /api/admin routes). */
export function isAdminRequest(req: Request): boolean {
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return false;
  const a = Buffer.from(req.headers.get("x-admin-secret") ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
