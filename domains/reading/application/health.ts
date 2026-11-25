// Is the reading domain alive? Public (no token): no data, only counts.
import { tableAnswers } from "../infrastructure/repo";

export const READING_VERSION = "3";

export async function health(): Promise<{ ok: boolean; db: boolean; version: string; items: number; media: number }> {
  const t = await tableAnswers();
  return { ok: t.ok, db: t.ok, version: READING_VERSION, items: t.items, media: t.media };
}
