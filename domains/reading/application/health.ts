// Is the reading domain alive? Public (no token): no data, only whether the table answers.
import { tableAnswers } from "../infrastructure/repo";

export const READING_VERSION = "2";

export async function health(): Promise<{ ok: boolean; db: boolean; version: string }> {
  const db = await tableAnswers();
  return { ok: db, db, version: READING_VERSION };
}
