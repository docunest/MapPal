import { api } from "@/lib/grocery/http";
import { loadState, stateVersion, catalogVersion } from "@/lib/grocery/store";
import { ensureReady } from "@/lib/grocery/seed";

// Polled by every open phone (2 s in the store, 5 s otherwise). Cheap when
// nothing changed: one fingerprint query, no rows.
export const GET = api(async ({ req }) => {
  const v = new URL(req.url).searchParams.get("v");
  if (v) {
    await ensureReady();
    const [now, cv] = await Promise.all([stateVersion(), catalogVersion()]);
    if (now === v) return { unchanged: true, version: now, catalogVersion: cv };
  }
  return loadState();
});
