import { summarize, type Summary } from "../domain/attempt";
import { attemptsSince } from "../infrastructure/repo";
import { BadRequest } from "../infrastructure/http";

const DAY = 24 * 60 * 60 * 1000;

/** Summary for the parent: default last 14 days, optionally one level. */
export async function getSummary(params: URLSearchParams, now = new Date()): Promise<Summary & { days: number; level: number | null }> {
  const days = params.get("days") ? Number(params.get("days")) : 14;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new BadRequest("days must be 1 to 365");
  const levelRaw = params.get("level");
  const level = levelRaw ? Number(levelRaw) : null;
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 5)) throw new BadRequest("level must be 1 to 5");
  const rows = await attemptsSince(new Date(now.getTime() - days * DAY), level);
  return { ...summarize(rows), days, level };
}
