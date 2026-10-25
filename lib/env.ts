/** Set and not just whitespace — an empty Vercel env var counts as missing. */
export function envPresent(name: string, env: Record<string, string | undefined> = process.env): boolean {
  return !!env[name]?.trim();
}
