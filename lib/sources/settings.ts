import { prisma } from "../db";
import type { Source } from "./types";

let cache: { at: number; settings: Record<string, boolean> } | null = null;

/** On/off switches from /sources. Missing row = on. Cached briefly per instance. */
export async function loadSourceSettings(): Promise<Record<string, boolean>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.settings;
  try {
    const rows = await prisma.sourceSetting.findMany();
    cache = { at: Date.now(), settings: Object.fromEntries(rows.map((r) => [r.source, r.enabled])) };
  } catch {
    // A settings read failure must not take the app down — treat all as on.
    cache = { at: Date.now(), settings: {} };
  }
  return cache.settings;
}

export function clearSourceSettingsCache() {
  cache = null;
}

export type SourceState = "on" | "off" | "not-configured";

export function sourceState(source: Source, settings: Record<string, boolean>): SourceState {
  if (!source.configured()) return "not-configured";
  return settings[source.meta.id] === false ? "off" : "on";
}
