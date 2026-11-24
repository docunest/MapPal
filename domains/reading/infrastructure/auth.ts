// One reading token for the tablet, the parent phone and any analysis agent.
// Only its SHA-256 is stored (table reading_device, one row). Rotate it with the admin route.
import { prisma } from "@/lib/db";
import { tokenHash } from "../domain/device";

export async function tokenOk(token: string | undefined | null): Promise<boolean> {
  if (!token || token.trim().length < 20) return false;
  const row = await prisma.readingDevice.findFirst({ where: { tokenSha256: tokenHash(token), revokedAt: null }, select: { id: true } });
  return row !== null;
}

export function readingTokenFrom(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const q = new URL(req.url).searchParams;
  return (bearer ?? q.get("t") ?? undefined)?.trim();
}
