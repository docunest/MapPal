// Every place MapPal already learns where the family is or is going
// (design doc: latest known location from any source).
import { prisma } from "@/lib/db";
import { coordsInLogLine, isHereLink, type Fix } from "../domain/travelState";

const WEEKS = (n: number) => new Date(Date.now() - n * 7 * 86_400_000);

export async function loadFixes(): Promise<Fix[]> {
  const since = WEEKS(4);
  const [fixes, items, logs, stops] = await Promise.all([
    prisma.travelFix.findMany({ where: { at: { gte: since } }, orderBy: { at: "desc" }, take: 300 }),
    prisma.dockItem.findMany({ where: { createdAt: { gte: since }, lat: { not: null }, lng: { not: null } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.dockLog.findMany({ where: { tag: "GPS", at: { gte: since } }, orderBy: { at: "desc" }, take: 5000, select: { msg: true, at: true, device: true } }),
    prisma.stop.findMany({ where: { deletedAt: null, status: { in: ["CURRENT", "FUTURE"] } }, orderBy: { updatedAt: "desc" }, take: 30 }),
  ]);
  const out: Fix[] = [];
  for (const f of fixes) {
    out.push({ kind: f.kind === "destination" ? "destination" : "position", source: f.source, label: f.label ?? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`, lat: f.lat, lng: f.lng, at: f.at });
  }
  for (const i of items) {
    const gps = i.kind === "bookmark" && i.locatedBy === "gps";
    const here = gps || isHereLink(i.title);
    out.push({
      kind: here ? "position" : "destination",
      source: gps ? "car bookmark (GPS)" : `shared from a phone${i.sentBy ? ` (${i.sentBy})` : ""}`,
      label: i.title,
      lat: i.lat!,
      lng: i.lng!,
      at: i.createdAt,
    });
  }
  // The head unit's GPS log: a track, at most one fix per 30 min (the estimate
  // uses the newest; the rest are history for the continuity check and the map).
  let lastKept = Infinity;
  for (const l of logs) {
    const p = coordsInLogLine(l.msg);
    if (!p || lastKept - l.at.getTime() < 1_800_000) continue;
    lastKept = l.at.getTime();
    out.push({ kind: "position", source: `car GPS log (${l.device})`, label: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, ...p, at: l.at });
    if (out.length > 400) break;
  }
  for (const s of stops) {
    out.push({
      kind: s.status === "CURRENT" ? "position" : "destination",
      source: s.status === "CURRENT" ? "current stop" : "planned stop",
      label: s.name,
      lat: s.lat,
      lng: s.lng,
      at: s.updatedAt,
      arriveOn: s.arriveOn ?? undefined,
    });
  }
  return out;
}

/** Remember a position/destination from a source with no table of its own (Road ahead). */
export async function recordFix(f: { kind: "position" | "destination"; source: string; lat: number; lng: number; label?: string }) {
  // One row per source and kind every 10 minutes at most, newest 500 kept.
  const recent = await prisma.travelFix.findFirst({ where: { kind: f.kind, source: f.source, at: { gte: new Date(Date.now() - 600_000) } }, orderBy: { at: "desc" } });
  if (recent) {
    await prisma.travelFix.update({ where: { id: recent.id }, data: { lat: f.lat, lng: f.lng, label: f.label ?? null, at: new Date() } });
    return;
  }
  await prisma.travelFix.create({ data: { kind: f.kind, source: f.source, lat: f.lat, lng: f.lng, label: f.label } });
  const old = await prisma.travelFix.findMany({ orderBy: { at: "desc" }, skip: 500, select: { id: true } });
  if (old.length) await prisma.travelFix.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}
