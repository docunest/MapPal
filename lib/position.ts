// "Where is home right now" for devices without GPS (the kid tablet feeds it to
// Android as a mock location). Home = the strongest fresh position hint: an owner
// pin beats the car, newer beats older (trust halves every 12 h). Not the
// estimate's weighted centre, which can sit kilometres away between stops.
import { createHash, timingSafeEqual } from "node:crypto";
import { SOURCE_TRUST, type TravelState } from "@/lib/agent/domain/travelState";

export interface Home {
  lat: number;
  lng: number;
  accuracyM: number;
  source: string;
  label: string;
  at: string; // ISO time of the fix
}

export function homeOf(s: Pick<TravelState, "hints" | "position">): Home | null {
  const best = s.hints.filter((h) => h.used).sort((a, b) => b.weight - a.weight)[0] ?? s.position;
  if (!best) return null;
  const km = SOURCE_TRUST.find(([r]) => r.test(best.source))?.[2] ?? 5;
  return {
    lat: Math.round(best.lat * 1e6) / 1e6,
    lng: Math.round(best.lng * 1e6) / 1e6,
    accuracyM: Math.round(km * 1000),
    source: best.source,
    label: best.label,
    at: new Date(best.at).toISOString(),
  };
}

// The repo is public and this token reveals where the family is, so only its
// SHA-256 is committed. The value lives on the tablet (set over adb) and in the
// owner's .env. POSITION_TOKEN on Vercel replaces it.
const DEFAULT_TOKEN_SHA256 = "e9cbab1a3b4f8c272fd1fdbeee753cc4bd963a70bec0a9264e48b01bd74c0059";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function isPositionToken(token: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!token) return false;
  const expected = env.POSITION_TOKEN?.trim() ? sha256(env.POSITION_TOKEN.trim()) : Buffer.from(DEFAULT_TOKEN_SHA256, "hex");
  return timingSafeEqual(sha256(token), expected);
}

export function positionTokenFrom(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer?.trim() || undefined;
}
