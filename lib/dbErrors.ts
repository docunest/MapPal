// Next.js strips error details from an uncaught throw in production API
// routes, leaving an opaque 500 with no body. Routes that touch the DB
// should catch and run the error through this instead of letting it throw.
export function describeDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Can't reach database server")) {
    return `Database unreachable — if DATABASE_URL points at Supabase's direct connection (db.*.supabase.co:5432), switch to the Transaction pooler host (aws-0-*.pooler.supabase.com:6543?pgbouncer=true); the direct host is IPv6-only and Vercel can't reach it. Raw error: ${message}`;
  }
  if (message.includes("does not exist") && message.includes("mappal_")) {
    return `Table missing — migrations haven't been applied to this database yet (prisma migrate deploy). Raw error: ${message}`;
  }
  return message;
}
