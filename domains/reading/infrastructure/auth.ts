// Device check for the reading API: the token is hashed and looked up in reading_device.
// Revoked devices and unknown tokens are refused. Issue tokens with `npm run reading:device -- add <name>`.
import { prisma } from "@/lib/db";
import { tokenHash } from "../domain/device";

export async function deviceFromToken(token: string | undefined | null): Promise<string | null> {
  if (!token || token.trim().length < 20) return null;
  const device = await prisma.readingDevice.findFirst({
    where: { tokenSha256: tokenHash(token), revokedAt: null },
    select: { id: true, name: true },
  });
  if (!device) return null;
  await prisma.readingDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return device.name;
}

export function readingTokenFrom(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const q = new URL(req.url).searchParams;
  return (bearer ?? q.get("t") ?? undefined)?.trim();
}
