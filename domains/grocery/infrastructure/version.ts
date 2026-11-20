// The build this server runs (Vercel's git commit). The page bakes the same
// value in at build time; every API reply sends the live one, so open phones
// notice a new deployment within one poll and reload themselves (ui/App.tsx).
export const APP_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GROCERY_VERSION || "dev").slice(0, 12);
