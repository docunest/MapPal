import { ensureReady } from "../infrastructure/seed";
import { catalogVersion, loadState, stateVersion } from "../infrastructure/repo";

/** The shared list. With the version the phone already has: just "unchanged" (cheap poll). */
export async function getState(knownVersion?: string | null) {
  if (knownVersion) {
    await ensureReady();
    const [now, cv] = await Promise.all([stateVersion(), catalogVersion()]);
    if (now === knownVersion) return { unchanged: true as const, version: now, catalogVersion: cv };
  }
  return loadState();
}
