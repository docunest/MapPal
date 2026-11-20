// Repository: all reads/writes of the grocery_* tables. Used by the
// application use cases (API routes and the MCP endpoint alike), so an agent
// sees exactly what the phones see.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ensureReady } from "./seed";
import type { AddInput, CategoryDto, EntryDto, EntryPatch, Kind, ProductPatch, TripDto } from "../domain/types";
import { fold, matchPhrase, type CatalogItem } from "../domain/text";
import { dueItems, type Purchase } from "../domain/suggest";
import type { HistoryRow } from "../domain/ai";

type EntryRow = Awaited<ReturnType<typeof prisma.groceryEntry.findFirstOrThrow>>;

const toDto = (e: EntryRow): EntryDto => ({
  id: e.id,
  productId: e.productId,
  name: e.name,
  categoryId: e.categoryId,
  kind: e.kind,
  qty: e.qty,
  note: e.note,
  status: e.status === "BOUGHT" ? "BOUGHT" : "OPEN",
  via: e.via,
  addedBy: e.addedBy,
  addedAt: e.addedAt.toISOString(),
  boughtAt: e.boughtAt?.toISOString() ?? null,
  boughtBy: e.boughtBy,
});

export async function loadCategories(): Promise<CategoryDto[]> {
  await ensureReady();
  const rows = await prisma.groceryCategory.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((c) => ({ id: c.id, nameLt: c.nameLt, nameEn: c.nameEn, emoji: c.emoji, kind: c.kind, sortOrder: c.sortOrder }));
}

export async function loadCatalog(): Promise<{ categories: CategoryDto[]; products: CatalogItem[]; version: string }> {
  await ensureReady();
  const [categories, products, stats, version] = await Promise.all([
    loadCategories(),
    prisma.groceryProduct.findMany({ where: { hidden: false }, orderBy: { name: "asc" } }),
    prisma.$queryRaw<{ product_id: string; uses: bigint; last: Date; bought: Date | null }[]>`
      SELECT product_id, count(*) AS uses, max(added_at) AS last,
             max(bought_at) FILTER (WHERE status = 'BOUGHT') AS bought
      FROM grocery_entry WHERE product_id IS NOT NULL GROUP BY product_id`,
    catalogVersion(),
  ]);
  const byId = new Map(stats.map((s) => [s.product_id, s]));
  return {
    categories,
    version,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      nameEn: p.nameEn,
      aliases: p.aliases,
      categoryId: p.categoryId,
      kind: p.kind,
      staple: p.staple,
      source: p.source,
      uses: Number(byId.get(p.id)?.uses ?? 0),
      lastUsedAt: byId.get(p.id)?.last.toISOString() ?? null,
      lastBoughtAt: byId.get(p.id)?.bought?.toISOString() ?? null,
    })),
  };
}

export async function catalogVersion(): Promise<string> {
  const [r] = await prisma.$queryRaw<{ v: string }[]>`
    SELECT (SELECT count(*) FROM grocery_product)::text
      || '.' || coalesce((SELECT extract(epoch FROM max(updated_at)) FROM grocery_product), 0)::text
      || '.' || coalesce((SELECT extract(epoch FROM max(updated_at)) FROM grocery_category), 0)::text AS v`;
  return r.v;
}

/** Fingerprint of everything the list screens show. Changes on any add/tick/edit/remove. */
export async function stateVersion(): Promise<string> {
  const [r] = await prisma.$queryRaw<{ v: string | null }[]>`
    SELECT md5(
      coalesce((SELECT string_agg(concat_ws(':', id, status, qty, note, category_id, kind, name, updated_at), ',' ORDER BY id)
                FROM grocery_entry WHERE archived = false), '')
      || '|' || coalesce((SELECT string_agg(concat_ws(':', id, ended_at), ',') FROM grocery_trip WHERE ended_at IS NULL), '')
      || '|' || coalesce((SELECT string_agg(concat_ws(':', id, sort_order, updated_at), ',' ORDER BY id) FROM grocery_category), '')
    ) AS v`;
  return r.v ?? "0";
}

export async function activeTrip(): Promise<TripDto> {
  const t = await prisma.groceryTrip.findFirst({ where: { endedAt: null } });
  return t ? { id: t.id, startedAt: t.startedAt.toISOString(), startedBy: t.startedBy } : null;
}

export async function loadState(): Promise<{ version: string; catalogVersion: string; entries: EntryDto[]; trip: TripDto; categories: CategoryDto[] }> {
  await ensureReady();
  const [version, cv, entries, trip, categories] = await Promise.all([
    stateVersion(),
    catalogVersion(),
    prisma.groceryEntry.findMany({ where: { archived: false }, orderBy: { addedAt: "asc" } }),
    activeTrip(),
    loadCategories(),
  ]);
  return { version, catalogVersion: cv, entries: entries.map(toDto), trip, categories };
}

export type AddResult = { entry: EntryDto; merged: boolean; createdProduct: boolean };

function mergeAliases(existing: { name: string; nameEn: string | null; aliases: string[] }, add: string[]): string[] | null {
  const have = new Set([existing.name, existing.nameEn ?? "", ...existing.aliases].map(fold));
  const fresh = add.map((a) => a.trim()).filter((a) => a && !have.has(fold(a)));
  return fresh.length ? [...existing.aliases, ...new Set(fresh)].slice(0, 30) : null;
}

/** Put things on the list. Same product already open → no duplicate (qty updated if given). */
export async function addItems(items: AddInput[], member: string | null, via: string): Promise<AddResult[]> {
  await ensureReady();
  const catIds = new Set((await prisma.groceryCategory.findMany({ select: { id: true } })).map((c) => c.id));
  let catalog: CatalogItem[] | null = null;
  const results: AddResult[] = [];
  for (const it of items) {
    const name = it.name?.trim().slice(0, 80);
    if (!name && !it.productId) continue;
    if (it.id) {
      const exists = await prisma.groceryEntry.findUnique({ where: { id: it.id } });
      if (exists) {
        results.push({ entry: toDto(exists), merged: true, createdProduct: false }); // retried request
        continue;
      }
    }
    let product = it.productId ? await prisma.groceryProduct.findUnique({ where: { id: it.productId } }) : null;
    let createdProduct = false;
    if (!product && name) {
      catalog ??= (await loadCatalog()).products;
      const m = matchPhrase(name, catalog);
      if (m && m.confidence >= 0.95) product = await prisma.groceryProduct.findUnique({ where: { id: m.item.id } });
    }
    const categoryId = it.categoryId && catIds.has(it.categoryId) ? it.categoryId : null;
    if (!product) {
      product = await prisma.groceryProduct.create({
        data: {
          name: name!,
          nameEn: it.nameEn ?? null,
          aliases: (it.aliases ?? []).filter((a) => fold(a) !== fold(name!)),
          categoryId: categoryId ?? "kita",
          kind: it.kind ?? (categoryId ? (await prisma.groceryCategory.findUnique({ where: { id: categoryId } }))!.kind : "GROCERY"),
          source: via === "ai" ? "ai" : "user",
        },
      });
      createdProduct = true;
      catalog = null;
    } else {
      const patch: { aliases?: string[]; hidden?: boolean } = {};
      const merged = mergeAliases(product, it.aliases ?? []);
      if (merged) patch.aliases = merged;
      if (product.hidden) patch.hidden = false;
      if (Object.keys(patch).length) product = await prisma.groceryProduct.update({ where: { id: product.id }, data: { ...patch, updatedAt: new Date() } });
    }
    const open = await prisma.groceryEntry.findFirst({ where: { productId: product.id, archived: false, status: "OPEN" } });
    if (open) {
      const updated =
        it.qty && it.qty !== open.qty ? await prisma.groceryEntry.update({ where: { id: open.id }, data: { qty: it.qty } }) : open;
      results.push({ entry: toDto(updated), merged: true, createdProduct });
      continue;
    }
    const entry = await prisma.groceryEntry.create({
      data: {
        id: it.id ?? randomUUID(),
        productId: product.id,
        name: product.name,
        categoryId: product.categoryId,
        kind: product.kind,
        qty: it.qty?.slice(0, 20) ?? null,
        note: it.note?.slice(0, 120) ?? null,
        via,
        addedBy: member,
      },
    });
    results.push({ entry: toDto(entry), merged: false, createdProduct });
  }
  if (member) await touchMember(member);
  return results;
}

/** Take things off the list by product or name (used by "pieno nebereikia" and MCP). */
export async function removeByProduct(productIds: string[]): Promise<number> {
  const r = await prisma.groceryEntry.updateMany({
    where: { productId: { in: productIds }, archived: false, status: "OPEN" },
    data: { status: "REMOVED", archived: true },
  });
  return r.count;
}

async function ensureTrip(member: string | null): Promise<string> {
  // Two phones ticking at the same moment must join one trip, not open two.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7311942777)`;
    const t = await tx.groceryTrip.findFirst({ where: { endedAt: null } });
    return t ? t.id : (await tx.groceryTrip.create({ data: { startedBy: member } })).id;
  });
}

export async function updateEntry(id: string, patch: EntryPatch, member: string | null): Promise<EntryDto | null> {
  await ensureReady();
  const e = await prisma.groceryEntry.findUnique({ where: { id } });
  if (!e || e.archived) return null;
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status === "BOUGHT" && e.status !== "BOUGHT") {
    Object.assign(data, { status: "BOUGHT", boughtAt: new Date(), boughtBy: member, tripId: await ensureTrip(member) });
  } else if (patch.status === "OPEN" && e.status !== "OPEN") {
    Object.assign(data, { status: "OPEN", boughtAt: null, boughtBy: null, tripId: null });
  } else if (patch.status === "REMOVED") {
    Object.assign(data, { status: "REMOVED", archived: true });
  }
  if (patch.qty !== undefined) data.qty = patch.qty?.slice(0, 20) || null;
  if (patch.note !== undefined) data.note = patch.note?.slice(0, 120) || null;
  if (patch.name) data.name = patch.name.slice(0, 80);
  // Moving an item to another section / to long-term teaches the catalog too.
  const productPatch: Record<string, unknown> = {};
  if (patch.categoryId && patch.categoryId !== e.categoryId) {
    const cat = await prisma.groceryCategory.findUnique({ where: { id: patch.categoryId } });
    if (cat) {
      data.categoryId = cat.id;
      productPatch.categoryId = cat.id;
      if (!patch.kind) {
        data.kind = cat.kind;
        productPatch.kind = cat.kind;
      }
    }
  }
  if (patch.kind && patch.kind !== e.kind) {
    data.kind = patch.kind;
    productPatch.kind = patch.kind;
  }
  if (e.productId && Object.keys(productPatch).length) {
    await prisma.groceryProduct.update({ where: { id: e.productId }, data: { ...productPatch, updatedAt: new Date() } });
  }
  const updated = await prisma.groceryEntry.update({ where: { id }, data });
  if (member) await touchMember(member);
  return updated.archived ? null : toDto(updated);
}

/** "Finish shopping": bought lines become history; everything not bought stays on the list. */
export async function finishTrip(member: string | null): Promise<{ bought: number; carried: number; longTerm: number }> {
  await ensureReady();
  const trip = await prisma.groceryTrip.findFirst({ where: { endedAt: null } });
  const now = new Date();
  const bought = await prisma.groceryEntry.updateMany({
    where: { archived: false, status: "BOUGHT" },
    data: { archived: true, tripId: trip?.id ?? null },
  });
  if (trip) await prisma.groceryTrip.update({ where: { id: trip.id }, data: { endedAt: now, endedBy: member } });
  const [carried, longTerm] = await Promise.all([
    prisma.groceryEntry.count({ where: { archived: false, status: "OPEN", kind: "GROCERY" } }),
    prisma.groceryEntry.count({ where: { archived: false, status: "OPEN", kind: "LONGTERM" } }),
  ]);
  return { bought: bought.count, carried, longTerm };
}

export async function touchMember(name: string): Promise<void> {
  await prisma.groceryMember.upsert({ where: { name }, create: { name }, update: { lastSeenAt: new Date() } }).catch(() => {});
}

export async function listMembers(): Promise<string[]> {
  return (await prisma.groceryMember.findMany({ orderBy: { lastSeenAt: "desc" } })).map((m) => m.name);
}

/** Every completed purchase (archived BOUGHT lines). */
export async function purchases(): Promise<Purchase[]> {
  const rows = await prisma.groceryEntry.findMany({
    where: { archived: true, status: "BOUGHT", productId: { not: null } },
    select: { productId: true, boughtAt: true, addedAt: true },
  });
  return rows.map((r) => ({ productId: r.productId!, at: r.boughtAt ?? r.addedAt }));
}

export async function suggestionContext() {
  const [{ products, categories }, bought, state] = await Promise.all([loadCatalog(), purchases(), loadState()]);
  const openIds = new Set(state.entries.filter((e) => e.status === "OPEN" && e.productId).map((e) => e.productId!));
  const onList = new Set(state.entries.filter((e) => e.productId).map((e) => e.productId!));
  const due = dueItems(bought, products, onList, categories);
  const history: HistoryRow[] = due.stats.map((s) => ({
    id: s.product.id,
    name: s.product.name,
    categoryId: s.product.categoryId,
    kind: s.product.kind,
    count: s.count,
    intervalDays: s.intervalDays,
    daysSince: s.daysSince,
  }));
  return { due, history, products, categories, state, openIds };
}

export async function setCategoryOrder(ids: string[]): Promise<void> {
  await ensureReady();
  await prisma.$transaction(ids.map((id, i) => prisma.groceryCategory.updateMany({ where: { id }, data: { sortOrder: (i + 1) * 10, updatedAt: new Date() } })));
}

export async function updateProduct(id: string, patch: ProductPatch) {
  await ensureReady();
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name?.trim()) data.name = patch.name.trim().slice(0, 80);
  if (patch.nameEn !== undefined) data.nameEn = patch.nameEn?.trim() || null;
  if (patch.aliases) data.aliases = [...new Set(patch.aliases.map((a) => a.trim()).filter(Boolean))].slice(0, 30);
  if (patch.categoryId) data.categoryId = patch.categoryId;
  if (patch.kind) data.kind = patch.kind;
  if (patch.hidden !== undefined) data.hidden = patch.hidden;
  if (patch.staple !== undefined) data.staple = patch.staple;
  const p = await prisma.groceryProduct.update({ where: { id }, data });
  // Keep open lines in step with the product (name/section shown in the store).
  const entryData: Record<string, unknown> = {};
  if (data.name) entryData.name = data.name;
  if (data.categoryId) entryData.categoryId = data.categoryId;
  if (data.kind) entryData.kind = data.kind;
  if (Object.keys(entryData).length) await prisma.groceryEntry.updateMany({ where: { productId: id, archived: false }, data: entryData });
  return p;
}

/** A product typed by hand turned out to be a known one: move its lines there, keep the spelling as an alias. */
export async function mergeProductInto(id: string, target: CatalogItem): Promise<void> {
  const typed = await prisma.groceryProduct.findUnique({ where: { id } });
  if (!typed) return;
  await prisma.$transaction([
    prisma.groceryEntry.updateMany({ where: { productId: id }, data: { productId: target.id, name: target.name, categoryId: target.categoryId, kind: target.kind } }),
    prisma.groceryProduct.update({ where: { id: target.id }, data: { aliases: [...new Set([...target.aliases, typed.name])], updatedAt: new Date() } }),
    prisma.groceryProduct.update({ where: { id }, data: { hidden: true, updatedAt: new Date() } }),
  ]);
}

/** DeepSeek filed a new product: its section/kind (and its open lines with it). source = "ai". */
export async function fileProduct(id: string, f: { categoryId: string; kind: Kind; nameEn: string | null }): Promise<void> {
  await prisma.groceryProduct.update({
    where: { id },
    data: { categoryId: f.categoryId, kind: f.kind, nameEn: f.nameEn ?? undefined, source: "ai", updatedAt: new Date() },
  });
  await prisma.groceryEntry.updateMany({ where: { productId: id, archived: false }, data: { categoryId: f.categoryId, kind: f.kind } });
}
