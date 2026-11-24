// Parent/device token for the reading domain. Set READING_TOKEN on Vercel (never in git).
// Without it the API refuses every call, so nothing is open by default.
export function readingTokenOk(token: string | undefined | null, env: Record<string, string | undefined> = process.env): boolean {
  const expected = env.READING_TOKEN?.trim();
  if (!expected || !token) return false;
  const a = Buffer.from(token.trim()), b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function readingTokenFrom(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const q = new URL(req.url).searchParams;
  return (bearer ?? q.get("t") ?? undefined)?.trim();
}
