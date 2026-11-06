// DB side of scenarios: seeding, versions, stops, cached results, the place
// store, and running the pipeline for a stop (docs/PLAN.md → "Scenarios and
// regions"). PAST stops are frozen: their results are kept and never re-run.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { deepseekClient, deepseekConfigured, type AiClient } from "../ai/deepseek";
import { prisma } from "../db";
import { distanceMeters, type LatLng } from "../geo";
import { localLangsFor } from "../nearby/languages";
import { reversePlace, reverseRegion } from "../nominatim";
import { overpassQuery } from "../overpass";
import { loadSourceSettings } from "../sources/settings";
import { createUsageGuard } from "../sources/usage";
import { dbUsageStore } from "../sources/usageDb";
import { DEFAULT_SCENARIOS } from "./defaults";
import { runPipeline } from "./pipeline";
import type { PipelineNote, ResultItem, ScenarioConfig, TopDownPlan } from "./types";
import type { AiCheck } from "./validate";

export class ScenarioError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// --- config validation (what a saved version may contain) -----------------

const Tag = z.tuple([z.string().regex(/^[a-z_:]{2,40}$/), z.string().regex(/^[A-Za-z0-9_ ;-]{1,40}$/)]);
const tierMap = <T extends z.ZodTypeAny>(v: T) => z.record(z.string().regex(/^\d$/), v);
export const ScenarioConfigSchema = z.object({
  categoryLabel: z.string().min(3).max(80),
  osmTags: z.array(Tag).min(1).max(30),
  nameKeywords: z.array(z.string().min(2).max(40)).max(40),
  brands: z.record(z.string().regex(/^([A-Z]{2}|\*)$/), z.array(z.object({ tier: z.number().int().min(1).max(9), brands: z.array(z.string().min(1).max(60)).max(80) }))),
  tagTier: z.record(z.string(), z.number().int().min(1).max(9)),
  lastTier: z.number().int().min(1).max(9),
  tierLabels: tierMap(z.string().max(60)),
  tierBonusKm: tierMap(z.number().min(0).max(100)),
  bigTiers: z.array(z.number().int().min(1).max(9)),
  uncertainTags: z.array(z.string()).max(20),
  perTier: z.number().int().min(1).max(20),
});

// --- scenarios ---------------------------------------------------------------

export async function ensureScenariosSeeded() {
  for (const s of DEFAULT_SCENARIOS) {
    const existing = await prisma.scenario.findUnique({ where: { slug: s.slug }, select: { id: true } });
    if (existing) continue;
    await prisma.scenario.create({
      data: {
        slug: s.slug,
        title: s.title,
        icon: s.icon,
        description: s.description,
        activeVersion: 1,
        versions: {
          create: { version: 1, prompt: s.prompt, config: s.config as unknown as Prisma.InputJsonValue, createdBy: "default", note: "Initial default (from docs/PLAN.md use cases)" },
        },
      },
    });
  }
}

export async function listScenarios() {
  await ensureScenariosSeeded();
  const rows = await prisma.scenario.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { versions: { orderBy: { version: "desc" }, take: 10 } },
  });
  return rows.map((s) => ({ ...s, active: s.versions.find((v) => v.version === s.activeVersion) ?? s.versions[0] }));
}

export async function activeVersion(slug: string) {
  await ensureScenariosSeeded();
  const s = await prisma.scenario.findUnique({ where: { slug } });
  if (!s || s.deletedAt) throw new ScenarioError(`No scenario "${slug}"`, 404);
  const v = await prisma.scenarioVersion.findUnique({ where: { scenarioId_version: { scenarioId: s.id, version: s.activeVersion } } });
  if (!v) throw new ScenarioError(`Scenario "${slug}" has no version ${s.activeVersion}`, 500);
  return { scenario: s, version: v, config: v.config as unknown as ScenarioConfig };
}

/** Save a new version and make it active. Results of older versions stay (past stops keep theirs). */
export async function saveScenarioVersion(slug: string, input: { prompt?: string; config?: unknown; note?: string }, by: string) {
  const { scenario, version } = await activeVersion(slug);
  const prompt = (input.prompt ?? version.prompt).trim();
  if (!prompt) throw new ScenarioError("Prompt can't be empty");
  const parsed = ScenarioConfigSchema.safeParse(input.config ?? version.config);
  if (!parsed.success) throw new ScenarioError(`Invalid config: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const next = version.version + 1;
  await prisma.$transaction([
    prisma.scenarioVersion.create({
      data: { scenarioId: scenario.id, version: next, prompt, config: parsed.data as Prisma.InputJsonValue, createdBy: by, note: input.note },
    }),
    prisma.scenario.update({ where: { id: scenario.id }, data: { activeVersion: next } }),
  ]);
  return activeVersion(slug);
}

// --- stops (regions) -----------------------------------------------------------

export const StopInput = z.object({
  name: z.string().min(1).max(120).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(60).optional(),
  status: z.enum(["FUTURE", "CURRENT", "PAST"]).optional(),
  arriveOn: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

export async function createStop(input: z.infer<typeof StopInput>, by: string) {
  const [region, place] = await Promise.all([
    reverseRegion(input).catch(() => ({ country: undefined, region: undefined })),
    input.name ? Promise.resolve({ name: input.name }) : reversePlace(input).catch(() => ({ name: undefined, address: undefined })),
  ]);
  const name = input.name ?? place.name ?? ("address" in place && place.address ? place.address.split(",").slice(-2, -1)[0]?.trim() : undefined) ?? `${input.lat.toFixed(3)}, ${input.lng.toFixed(3)}`;
  return prisma.stop.create({
    data: {
      name,
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm ?? 15,
      status: input.status ?? "FUTURE",
      country: region.country,
      area: region.region,
      arriveOn: input.arriveOn ? new Date(input.arriveOn) : undefined,
      note: input.note,
      createdBy: by,
    },
  });
}

export async function listStops() {
  return prisma.stop.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: "asc" }, { arriveOn: "asc" }, { createdAt: "desc" }],
    include: { results: { select: { scenarioVersionId: true, status: true, finishedAt: true, aiTokensIn: true, aiTokensOut: true } } },
  });
}

/** The stop whose radius covers this point (nearest centre first), if any. */
export async function stopCovering(p: LatLng) {
  // Coarse box first (1° lat ≈ 111 km; radius ≤ 60 km), exact distance after.
  const stops = await prisma.stop.findMany({
    where: { deletedAt: null, lat: { gte: p.lat - 0.6, lte: p.lat + 0.6 }, lng: { gte: p.lng - 0.8, lte: p.lng + 0.8 } },
  });
  return stops
    .map((s) => ({ s, d: distanceMeters(p, s) }))
    .filter(({ s, d }) => d <= s.radiusKm * 1000)
    .sort((a, b) => a.d - b.d)[0]?.s;
}

// --- running -------------------------------------------------------------------

async function aiClient(): Promise<AiClient | null> {
  if (!deepseekConfigured()) return null;
  const settings = await loadSourceSettings();
  if (settings.deepseek === false) return null; // turned off on /sources
  return deepseekClient({ usage: createUsageGuard(dbUsageStore), store: dbUsageStore });
}

export interface StoredResult {
  id: string;
  status: string;
  items: ResultItem[];
  dropped: Array<{ key: string; name: string; reason: string; lat: number; lng: number }>;
  notes: PipelineNote[];
  plan?: TopDownPlan;
  aiTokensIn: number;
  aiTokensOut: number;
  finishedAt: Date | null;
  error: string | null;
}

function toStored(r: { id: string; status: string; items: unknown; notes: unknown; aiTokensIn: number; aiTokensOut: number; finishedAt: Date | null; error: string | null }): StoredResult {
  const notes = (r.notes ?? {}) as { notes?: PipelineNote[]; dropped?: StoredResult["dropped"]; plan?: TopDownPlan };
  return {
    id: r.id,
    status: r.status,
    items: (r.items ?? []) as ResultItem[],
    dropped: notes.dropped ?? [],
    notes: notes.notes ?? [],
    plan: notes.plan,
    aiTokensIn: r.aiTokensIn,
    aiTokensOut: r.aiTokensOut,
    finishedAt: r.finishedAt,
    error: r.error,
  };
}

export async function cachedResult(versionId: string, stopId: string): Promise<StoredResult | null> {
  const r = await prisma.scenarioResult.findUnique({ where: { scenarioVersionId_stopId: { scenarioVersionId: versionId, stopId } } });
  return r ? toStored(r) : null;
}

const RUNNING_STALE_MS = 3 * 60 * 1000;

export async function runScenarioAtStop(slug: string, stopId: string, opts: { force?: boolean } = {}): Promise<StoredResult> {
  const { version, config } = await activeVersion(slug);
  const stop = await prisma.stop.findUnique({ where: { id: stopId } });
  if (!stop || stop.deletedAt) throw new ScenarioError("No such stop", 404);
  const raw = await prisma.scenarioResult.findUnique({ where: { scenarioVersionId_stopId: { scenarioVersionId: version.id, stopId: stop.id } } });
  const existing = raw ? toStored(raw) : null;
  if (stop.status === "PAST") {
    if (existing) return existing;
    throw new ScenarioError("This stop is in the past: past stops are frozen and never run (saves tokens).", 409);
  }
  if (existing?.status === "done" && !opts.force) return existing;
  if (raw?.status === "running" && Date.now() - raw.startedAt.getTime() < RUNNING_STALE_MS) {
    throw new ScenarioError("A run for this stop is already in progress", 409);
  }

  const row = await prisma.scenarioResult.upsert({
    where: { scenarioVersionId_stopId: { scenarioVersionId: version.id, stopId: stop.id } },
    create: { scenarioVersionId: version.id, stopId: stop.id, status: "running", items: [], notes: {} },
    update: { status: "running", error: null, startedAt: new Date() },
  });

  try {
    const area = stop.area ?? stop.country ?? "unknown";
    const [planRow, ai] = await Promise.all([
      prisma.scenarioPlan.findUnique({ where: { scenarioVersionId_area: { scenarioVersionId: version.id, area } } }),
      aiClient(),
    ]);
    const radius = stop.radiusKm * 1000;
    const near = await prisma.poi.findMany({
      where: {
        osmRef: { not: null },
        lat: { gte: stop.lat - radius / 111000 - 0.01, lte: stop.lat + radius / 111000 + 0.01 },
        lng: { gte: stop.lng - radius / 80000 - 0.01, lte: stop.lng + radius / 80000 + 0.01 },
      },
      select: { osmRef: true, checks: true },
    });
    const cachedChecks = new Map<string, AiCheck>();
    for (const p of near) {
      const c = (p.checks as unknown as Record<string, AiCheck>)[slug];
      if (c && p.osmRef) cachedChecks.set(p.osmRef, c);
    }

    const out = await runPipeline({
      scenario: { slug, prompt: version.prompt, config },
      stop: { lat: stop.lat, lng: stop.lng, radiusKm: stop.radiusKm, country: stop.country ?? undefined, area: stop.area ?? undefined },
      langs: localLangsFor({ country: stop.country ?? undefined, region: stop.area ?? undefined }),
      cachedPlan: planRow ? (planRow.plan as unknown as TopDownPlan) : undefined,
      ai,
      overpass: (q) => overpassQuery(q, { timeoutMs: 45000, totalBudgetMs: 50000 }),
      cachedChecks,
    });

    if (out.planIsNew) {
      await prisma.scenarioPlan.upsert({
        where: { scenarioVersionId_area: { scenarioVersionId: version.id, area } },
        create: { scenarioVersionId: version.id, area, plan: out.plan as unknown as Prisma.InputJsonValue, by: out.plan.by },
        update: { plan: out.plan as unknown as Prisma.InputJsonValue, by: out.plan.by },
      });
    }
    const items = await storePois(out.items, out.dropped, stop.country ?? undefined, slug, out.newChecks);
    const saved = await prisma.scenarioResult.update({
      where: { id: row.id },
      data: {
        status: "done",
        items: items as unknown as Prisma.InputJsonValue,
        notes: { notes: out.notes, dropped: out.dropped, plan: out.plan } as unknown as Prisma.InputJsonValue,
        aiTokensIn: out.aiTokensIn,
        aiTokensOut: out.aiTokensOut,
        finishedAt: new Date(),
      },
    });
    return toStored(saved);
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await prisma.scenarioResult.update({ where: { id: row.id }, data: { status: "error", error: message, finishedAt: new Date() } });
    throw new ScenarioError(`Run failed: ${message}`, 502);
  }
}

/** Upsert result places into the place store; returns items with their poiId. */
async function storePois(
  items: ResultItem[],
  dropped: StoredResult["dropped"],
  country: string | undefined,
  slug: string,
  newChecks: Map<string, AiCheck>,
): Promise<ResultItem[]> {
  const refOf = (key: string) => key.replace(/^osm:/, "");
  // Places the AI checked and rejected are stored too, so their check is reused next run.
  const rejected = dropped.filter((d) => newChecks.has(refOf(d.key)));
  const refs = [...items.map((i) => refOf(i.key)), ...rejected.map((d) => refOf(d.key))];
  const at = new Date().toISOString();
  const field = (value: unknown, url: string) => (value === undefined ? undefined : { value, source: "osm", url, at });
  const existing = await prisma.poi.findMany({ where: { osmRef: { in: refs } }, select: { osmRef: true } });
  const known = new Set(existing.map((e) => e.osmRef));
  const fresh = items.filter((i) => !known.has(refOf(i.key)));
  const freshRejected = rejected.filter((d) => !known.has(refOf(d.key)));
  if (freshRejected.length) {
    await prisma.poi.createMany({
      skipDuplicates: true,
      data: freshRejected.map((d) => ({ name: d.name, lat: d.lat, lng: d.lng, osmRef: refOf(d.key), country, data: {} })),
    });
  }
  if (fresh.length) {
    await prisma.poi.createMany({
      skipDuplicates: true,
      data: fresh.map((i) => {
        const ref = i.key.replace(/^osm:/, "");
        const url = `https://www.openstreetmap.org/${ref}`;
        return {
          name: i.name,
          lat: i.lat,
          lng: i.lng,
          osmRef: ref,
          brand: i.brand,
          country,
          data: {
            name: field(i.name, url),
            kind: field(i.kind, url),
            openingHours: field(i.openingHours, url),
            address: field(i.address, url),
            phone: field(i.phone, url),
            website: field(i.website, url),
          } as Prisma.InputJsonValue,
        };
      }),
    });
  }
  const rows = await prisma.poi.findMany({ where: { osmRef: { in: refs } }, select: { id: true, osmRef: true, checks: true } });
  const byRef = new Map(rows.map((r) => [r.osmRef!, r]));
  // Save new AI checks on the place, keyed by scenario, so the next run reuses them.
  for (const [ref, check] of newChecks) {
    const r = byRef.get(ref);
    if (!r) continue;
    await prisma.poi.update({ where: { id: r.id }, data: { checks: { ...(r.checks as object), [slug]: check } as unknown as Prisma.InputJsonValue } });
  }
  return items.map((i) => ({ ...i, poiId: byRef.get(i.key.replace(/^osm:/, ""))?.id }));
}
