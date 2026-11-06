import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scenarioErrorResponse } from "@/lib/scenarios/http";

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  radiusKm: z.number().min(1).max(60).optional(),
  status: z.enum(["FUTURE", "CURRENT", "PAST"]).optional(),
  arriveOn: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// PATCH /api/stops/:id — rename, change radius, tag future/current/past.
// Changing the radius of a stop with results would make them wrong, so it's refused (make a new stop).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected {name?, radiusKm?, status?, arriveOn?, note?}" }, { status: 400 });
  try {
    const stop = await prisma.stop.findUnique({ where: { id }, include: { _count: { select: { results: true } } } });
    if (!stop || stop.deletedAt) return NextResponse.json({ error: "No such stop" }, { status: 404 });
    if (parsed.data.radiusKm !== undefined && parsed.data.radiusKm !== stop.radiusKm && stop._count.results) {
      return NextResponse.json({ error: "This stop already has results for its radius — create a new stop instead" }, { status: 409 });
    }
    const { arriveOn, ...rest } = parsed.data;
    const updated = await prisma.stop.update({
      where: { id },
      data: { ...rest, ...(arriveOn !== undefined ? { arriveOn: arriveOn ? new Date(arriveOn) : null } : {}) },
    });
    return NextResponse.json({ stop: updated });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}

// DELETE /api/stops/:id — soft delete (kept for device sync; results stay in the DB).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.stop.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}
