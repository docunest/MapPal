// All reads and writes of the reading_* tables.
import { prisma } from "@/lib/db";
import type { AttemptInput, SummaryRow } from "../domain/attempt";

export async function insertAttempts(rows: AttemptInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  // skipDuplicates: the game may resend a batch after a dropped connection; the id makes it idempotent.
  const res = await prisma.readingAttempt.createMany({
    skipDuplicates: true,
    data: rows.map((r) => ({
      id: r.id,
      level: r.level,
      item: r.item,
      options: r.options,
      answer: r.answer,
      correct: r.correct,
      firstTry: r.firstTry,
      hintUsed: r.hintUsed,
      responseMs: r.responseMs,
      clientAt: r.clientAt ? new Date(r.clientAt) : null,
    })),
  });
  return res.count;
}

export async function attemptsSince(since: Date, level: number | null): Promise<SummaryRow[]> {
  const rows = await prisma.readingAttempt.findMany({
    where: { createdAt: { gte: since }, ...(level ? { level } : {}) },
    select: { item: true, level: true, correct: true, firstTry: true, responseMs: true },
    take: 100000,
  });
  return rows;
}

export async function createDevice(name: string, tokenSha256: string): Promise<void> {
  await prisma.readingDevice.create({ data: { name, tokenSha256 } });
}

export async function listDevices() {
  return prisma.readingDevice.findMany({
    orderBy: { createdAt: "asc" },
    select: { name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
}

export async function revokeDevice(name: string): Promise<number> {
  const res = await prisma.readingDevice.updateMany({ where: { name, revokedAt: null }, data: { revokedAt: new Date() } });
  return res.count;
}
