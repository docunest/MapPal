import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sourceStats } from "@/lib/feedback";
import { ALL_SOURCES } from "@/lib/sources/registry";
import { loadSourceSettings, sourceState } from "@/lib/sources/settings";
import { capFor, DEFAULT_CAPS, today } from "@/lib/sources/usage";

// GET /api/sources — every source: label, cost, AI flag, on/off/not
// configured, today's/this month's paid usage vs caps, and like totals.
// Never returns keys or env values.
export async function GET() {
  const [settings, stats] = await Promise.all([loadSourceSettings(), sourceStats().catch(() => ({}))]);
  const day = today();
  const usageRows = await prisma.sourceUsage
    .findMany({ where: { day: { startsWith: day.slice(0, 7) } } })
    .catch(() => [] as Array<{ source: string; sku: string; day: string; count: number }>);

  const sources = ALL_SOURCES.map((s) => {
    const skus = Object.keys(DEFAULT_CAPS)
      .filter((k) => k.startsWith(`${s.meta.id}:`))
      .map((k) => k.split(":")[1]);
    return {
      id: s.meta.id,
      label: s.meta.label,
      description: s.meta.description,
      type: s.meta.type,
      cost: s.meta.cost,
      ai: s.meta.ai,
      homepage: s.meta.homepage,
      requiresEnv: s.meta.requiresEnv ?? [],
      state: sourceState(s, settings),
      usage: skus.map((sku) => {
        const rows = usageRows.filter((r) => r.source === s.meta.id && r.sku === sku);
        return {
          sku,
          today: rows.filter((r) => r.day === day).reduce((n, r) => n + r.count, 0),
          month: rows.reduce((n, r) => n + r.count, 0),
          cap: capFor(s.meta.id, sku),
        };
      }),
      likes: (stats as Record<string, { up: number; down: number }>)[s.meta.id] ?? { up: 0, down: 0 },
    };
  });
  return NextResponse.json({ sources });
}
