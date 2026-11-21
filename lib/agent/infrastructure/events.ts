// The run's event log (mappal_agent_event): one row per step, under the run's
// id — the correlation id the debug page pulls everything by. Logging never
// breaks the work it describes.
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface EventInput {
  kind: string;
  summary: string;
  data?: unknown;
  tokens?: number;
  lat?: number;
  lng?: number;
}

export async function logEvent(runId: string, e: EventInput) {
  try {
    await prisma.agentEvent.create({
      data: { runId, kind: e.kind, summary: e.summary.slice(0, 500), data: (e.data ?? {}) as Prisma.InputJsonValue, tokens: Math.round(e.tokens ?? 0), lat: e.lat, lng: e.lng },
    });
  } catch {
    /* the log is for debugging; never fail the run because of it */
  }
}

/** Correlation id for work outside a run (indexing from the app or the agent). */
export const newCorrelationId = (prefix = "idx") => `${prefix}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;

export const eventsOf = (runId: string) => prisma.agentEvent.findMany({ where: { runId }, orderBy: { at: "asc" } });

export const recentIndexJobs = async (take = 30) =>
  prisma.agentEvent.groupBy({ by: ["runId"], where: { runId: { startsWith: "idx_" } }, _min: { at: true }, _max: { at: true }, _count: true, orderBy: { _max: { at: "desc" } }, take });
