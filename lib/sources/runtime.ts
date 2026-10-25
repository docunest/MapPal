// Wiring for API routes: which sources are active right now, and the
// DB-backed usage guard they share.
import { ALL_SOURCES, withCapability } from "./registry";
import { loadSourceSettings, sourceState } from "./settings";
import type { Capability, Source, SourceContext, SourceNote } from "./types";
import { createUsageGuard } from "./usage";
import { dbUsageStore } from "./usageDb";

export async function activeSources(cap: Capability): Promise<{ sources: Source[]; skipped: SourceNote[] }> {
  const settings = await loadSourceSettings();
  const sources: Source[] = [];
  const skipped: SourceNote[] = [];
  for (const s of withCapability(cap, ALL_SOURCES)) {
    const state = sourceState(s, settings);
    if (state === "on") sources.push(s);
    else
      skipped.push({
        source: s.meta.id,
        status: state === "off" ? "disabled" : "not-configured",
        message: state === "off" ? "Turned off on /sources" : `Needs ${s.meta.requiresEnv?.join(", ") ?? "configuration"}`,
      });
  }
  return { sources, skipped };
}

export function sourceContext(): SourceContext {
  return { usage: createUsageGuard(dbUsageStore) };
}

/** Public metadata for the UI (labels, links, AI flag) — no secrets. */
export function sourceDirectory() {
  return Object.fromEntries(
    ALL_SOURCES.map((s) => [
      s.meta.id,
      { label: s.meta.label, homepage: s.meta.homepage, ai: s.meta.ai, cost: s.meta.cost, type: s.meta.type },
    ]),
  );
}
