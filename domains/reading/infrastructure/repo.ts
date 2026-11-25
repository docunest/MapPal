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
      letterOk: r.letterOk,
      itemId: r.itemId,
      audio: r.audio,
    })),
  });
  return res.count;
}

export async function attemptsSince(since: Date, level: number | null): Promise<SummaryRow[]> {
  const rows = await prisma.readingAttempt.findMany({
    where: { createdAt: { gte: since }, ...(level ? { level } : {}) },
    select: { item: true, level: true, correct: true, firstTry: true, responseMs: true, audio: true },
    take: 100000,
  });
  return rows;
}


/** For the health check: do the tables answer, and how much content is there (counts only, no data)? */
export async function tableAnswers(): Promise<{ ok: boolean; items: number; media: number }> {
  try {
    const [items, media] = await Promise.all([prisma.readingItem.count(), prisma.readingMedia.count()]);
    return { ok: true, items, media };
  } catch {
    return { ok: false, items: 0, media: 0 };
  }
}
