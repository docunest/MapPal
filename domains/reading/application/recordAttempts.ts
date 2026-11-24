import { parseAttempt } from "../domain/attempt";
import { insertAttempts } from "../infrastructure/repo";
import { BadRequest } from "../infrastructure/http";

const MAX_PER_REQUEST = 50;

/** Accepts one attempt or {attempts: [...]} (the game sends a batch when it reconnects). */
export async function recordAttempts(raw: unknown): Promise<{ accepted: number }> {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { attempts?: unknown }).attempts)
    ? (raw as { attempts: unknown[] }).attempts
    : [raw];
  if (list.length > MAX_PER_REQUEST) throw new BadRequest(`at most ${MAX_PER_REQUEST} attempts per request`);
  const parsed = list.map((r, i) => {
    const p = parseAttempt(r);
    if (typeof p === "string") throw new BadRequest(`attempt ${i + 1}: ${p}`);
    return p;
  });
  const accepted = await insertAttempts(parsed);
  return { accepted };
}
