// Which server settings are present — names and yes/no only, never values.
// Missing required ones break the app (shown on the login screen); missing
// optional ones just switch a feature off (shown as a banner + on /sources).
import { prisma } from "./db";
import { describeDbError } from "./dbErrors";
import { envPresent } from "./env";

export { envPresent };

export interface EnvCheck {
  name: string;
  ok: boolean;
  /** What breaks (required) or switches off (optional) without it. */
  effect: string;
}

interface EnvSpec {
  name: string;
  effect: string;
  /** Other names that work just as well (legacy aliases). */
  aliases?: string[];
}

export const REQUIRED_ENV: EnvSpec[] = [
  { name: "DATABASE_URL", effect: "Nothing works: logins, saved places, prompts and settings all live in the database." },
  // next-auth reads AUTH_SECRET and falls back to the older NEXTAUTH_SECRET.
  { name: "AUTH_SECRET", aliases: ["NEXTAUTH_SECRET"], effect: "Nobody can log in (sessions can't be signed)." },
];

export const OPTIONAL_ENV: EnvSpec[] = [
  { name: "GOOGLE_MAPS_API_KEY", effect: "Google ratings, reviews, current opening hours and fuel prices are off." },
  { name: "DEEPSEEK_API_KEY", effect: "AI \"Explain it\" buttons are off." },
  { name: "ADMIN_SEED_SECRET", effect: "Agents can't edit prompt templates or create logins via the admin API." },
  { name: "DIRECT_URL", effect: "Database migrations can't run during deploys (the build step needs it)." },
];

function check(spec: EnvSpec, env: Record<string, string | undefined>): EnvCheck {
  const names = [spec.name, ...(spec.aliases ?? [])];
  return {
    name: spec.aliases?.length ? `${spec.name} (or ${spec.aliases.join(" / ")})` : spec.name,
    ok: names.some((n) => envPresent(n, env)),
    effect: spec.effect,
  };
}

export function envChecks(env: Record<string, string | undefined> = process.env) {
  return {
    required: REQUIRED_ENV.map((c) => check(c, env)),
    optional: OPTIONAL_ENV.map((c) => check(c, env)),
  };
}

export async function databaseCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!envPresent("DATABASE_URL")) return { ok: false, error: "DATABASE_URL is not set." };
  try {
    // Also proves the latest migration ran: this table is from the newest one.
    await prisma.$queryRaw`SELECT 1 FROM "mappal_source_setting" LIMIT 1`;
    return { ok: true };
  } catch (err) {
    const error = describeDbError(err);
    return {
      ok: false,
      error: error.startsWith("Table missing")
        ? `${error} Fix: make sure DIRECT_URL is set for this environment so the build's \`prisma migrate deploy\` runs, then redeploy — or POST /api/admin/run-migrations with the x-admin-secret header.`
        : error,
    };
  }
}

/** Human-readable problems that stop the app working — safe to show before login. */
export async function blockingProblems(): Promise<string[]> {
  const { required } = envChecks();
  const problems = required.filter((c) => !c.ok).map((c) => `${c.name} is not set on the server. ${c.effect}`);
  if (envPresent("DATABASE_URL")) {
    const db = await databaseCheck();
    if (!db.ok) problems.push(`Database problem: ${db.error}`);
  }
  return problems;
}
