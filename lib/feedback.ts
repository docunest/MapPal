// Likes (docs/PLAN.md §7c). 👍 on a place = "we liked this kind of thing"
// (and it goes on the family list); 👍/👎 on a source = "this source was
// useful here". Likes nudge ranking; they never hide anything.
import { prisma } from "./db";

export type FeedbackTarget = "place" | "source";

export interface FeedbackInput {
  targetType: FeedbackTarget;
  targetKey: string;
  /** For source votes: the place the source was shown for. */
  placeKey?: string;
  placeKind?: string;
  /** +1, -1, or 0 to take a vote back. */
  value: -1 | 0 | 1;
}

export async function recordFeedback(userEmail: string, f: FeedbackInput) {
  const where = {
    userEmail_targetType_targetKey_placeKey: {
      userEmail,
      targetType: f.targetType,
      targetKey: f.targetKey,
      placeKey: f.placeKey ?? "",
    },
  };
  if (f.value === 0) {
    await prisma.feedback.deleteMany({ where: where.userEmail_targetType_targetKey_placeKey });
    return null;
  }
  return prisma.feedback.upsert({
    where,
    create: { userEmail, targetType: f.targetType, targetKey: f.targetKey, placeKey: f.placeKey ?? "", placeKind: f.placeKind, value: f.value },
    update: { value: f.value, placeKind: f.placeKind },
  });
}

/** Per-kind ranking multiplier from place likes: +10 % per like, max +50 %. */
export function boostFromLikes(likes: number): number {
  return 1 + Math.min(5, Math.max(0, likes)) * 0.1;
}

export async function kindBoosts(): Promise<Record<string, number>> {
  const rows = await prisma.feedback.groupBy({
    by: ["placeKind"],
    where: { targetType: "place", value: 1, placeKind: { not: null } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.placeKind!, boostFromLikes(r._count._all)]));
}

/** What this user already voted on these places/sources — to show button state. */
export async function myVotes(userEmail: string, placeKeys: string[]) {
  const rows = await prisma.feedback.findMany({
    where: {
      userEmail,
      OR: [
        { targetType: "place", targetKey: { in: placeKeys } },
        { targetType: "source", placeKey: { in: placeKeys } },
      ],
    },
    select: { targetType: true, targetKey: true, placeKey: true, value: true },
  });
  return rows;
}

/** Up/down totals per source, for the /sources page. */
export async function sourceStats(): Promise<Record<string, { up: number; down: number }>> {
  const rows = await prisma.feedback.groupBy({
    by: ["targetKey", "value"],
    where: { targetType: "source" },
    _count: { _all: true },
  });
  const out: Record<string, { up: number; down: number }> = {};
  for (const r of rows) {
    out[r.targetKey] ??= { up: 0, down: 0 };
    if (r.value > 0) out[r.targetKey].up += r._count._all;
    else out[r.targetKey].down += r._count._all;
  }
  return out;
}
