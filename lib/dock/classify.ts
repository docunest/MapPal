import { after } from "next/server";
import { prisma } from "@/lib/db";
import { categoryByOsm, categoryByRules, inBigCity, type Category } from "./category";

// Server side of the place categories (lib/dock/category.ts): rules when a place
// is stored, OpenStreetMap after the response (never slows the send down), and
// old places a few at a time behind the head unit's polls.

/** Fields for a new item: the rules' answer (or null → OSM later) and the big-city badge. */
export function rulesFor(title: string, address?: string | null) {
  const category = categoryByRules(title, address);
  return { category, categorySource: category ? "rules" : null, bigCity: inBigCity(address) };
}

const busy = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Classify one stored place that has no category yet: rules, then OSM. Returns what it set. */
export async function classifyStored(id: string): Promise<Category | null> {
  if (busy.has(id)) return null;
  busy.add(id);
  try {
    const it = await prisma.dockItem.findUnique({ where: { id } });
    if (!it || it.categorySource) return (it?.category as Category) ?? null;
    const bigCity = inBigCity(it.address);
    const byRules = categoryByRules(it.title, it.address);
    if (byRules) {
      await prisma.dockItem.update({ where: { id }, data: { category: byRules, categorySource: "rules", bigCity } });
      return byRules;
    }
    if (it.lat == null || it.lng == null) {
      await prisma.dockItem.update({ where: { id }, data: { category: "other", categorySource: "none", bigCity } });
      return "other";
    }
    const osm = await categoryByOsm(it.title, { lat: it.lat, lng: it.lng });
    await prisma.dockItem.update({ where: { id }, data: { category: osm ?? "other", categorySource: "osm", bigCity } });
    return osm ?? "other";
  } catch (err) {
    console.error("[dock category]", err);
    return null;
  } finally {
    busy.delete(id);
  }
}

/** After the response: classify these ids, ≥ 1.1 s apart (OSM's fair-use pace). */
export function classifyLater(ids: string[]) {
  if (!ids.length) return;
  after(async () => {
    for (const [i, id] of ids.entries()) {
      if (i) await sleep(1100);
      await classifyStored(id);
    }
  });
}

/** Old places without a category: a few per poll, after answering. */
export async function backfillSome(limit = 6) {
  const todo = await prisma.dockItem.findMany({ where: { categorySource: null }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true } });
  classifyLater(todo.map((t) => t.id));
}
