// Reads and writes of reading_item, reading_image, reading_audio and reading_media.
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Kind } from "../domain/items";

export type ItemRow = Awaited<ReturnType<typeof prisma.readingItem.findFirstOrThrow>>;

// ---------------------------------------------------------------- files (by SHA-256, cached forever)
export async function putMedia(bytes: Buffer, mime: string): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  await prisma.readingMedia.createMany({ data: [{ hash, mime, bytes: new Uint8Array(bytes) }], skipDuplicates: true });
  return hash;
}
export async function getMedia(hash: string) {
  return prisma.readingMedia.findUnique({ where: { hash } });
}

// ---------------------------------------------------------------- items
export async function listItems(kind?: Kind) {
  return prisma.readingItem.findMany({ where: kind ? { kind } : {}, orderBy: [{ text: "asc" }] });
}
export async function getItem(id: string) {
  return prisma.readingItem.findUnique({ where: { id } });
}
export async function findItem(kind: Kind, text: string) {
  return prisma.readingItem.findUnique({ where: { kind_text: { kind, text } } });
}
export async function createItem(data: {
  kind: Kind; text: string; accented: string; accentChecked: boolean; syllables: string; difficulty: string;
  status?: string; groups?: string[]; phonogram?: string | null; sampleItemId?: string | null;
}) {
  return prisma.readingItem.create({ data });
}
export async function updateItem(id: string, data: Partial<{
  text: string; accented: string; accentChecked: boolean; syllables: string; status: string; difficulty: string;
  gradeOverride: string | null; needsBetterImage: boolean; notOk: boolean; lettersMode: string; sampleItemId: string | null;
  groups: string[]; phonogram: string | null;
}>) {
  return prisma.readingItem.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
}
/** Any photo or clip change bumps the item, so the games' content version moves. */
export async function touch(id: string) {
  await prisma.readingItem.update({ where: { id }, data: { updatedAt: new Date() } });
}
export async function contentVersion(): Promise<number> {
  const r = await prisma.readingItem.aggregate({ _max: { updatedAt: true }, _count: { _all: true } });
  return (r._max.updatedAt?.getTime() ?? 0) + r._count._all;   // a deleted/added row also moves it
}

// ---------------------------------------------------------------- photos and clips
export async function imagesFor(itemIds: string[]) {
  return prisma.readingImage.findMany({ where: { itemId: { in: itemIds } }, orderBy: { createdAt: "asc" } });
}
export async function audioFor(itemIds: string[]) {
  return prisma.readingAudio.findMany({ where: { itemId: { in: itemIds } }, orderBy: { createdAt: "asc" } });
}
export async function addImage(itemId: string, d: { mediaHash: string; source: string; title?: string | null; artist?: string | null;
  license?: string | null; page?: string | null; sourceUrl?: string | null; selected?: boolean }) {
  const img = await prisma.readingImage.create({ data: { itemId, ...d } });
  if (d.selected) await selectImage(itemId, img.id); else await touch(itemId);
  return img;
}
export async function selectImage(itemId: string, imageId: string) {
  await prisma.$transaction([
    prisma.readingImage.updateMany({ where: { itemId }, data: { selected: false } }),
    prisma.readingImage.updateMany({ where: { itemId, id: imageId }, data: { selected: true } }),
  ]);
  await touch(itemId);
}
export async function addAudio(itemId: string, d: { kind: string; voice: string; mediaHash: string; selected?: boolean }) {
  // One clip per item × kind × voice: a new recording or regeneration replaces the old one.
  const old = await prisma.readingAudio.findFirst({ where: { itemId, kind: d.kind, voice: d.voice } });
  const row = old
    ? await prisma.readingAudio.update({ where: { id: old.id }, data: { mediaHash: d.mediaHash } })
    : await prisma.readingAudio.create({ data: { itemId, kind: d.kind, voice: d.voice, mediaHash: d.mediaHash, selected: false } });
  const anySelected = await prisma.readingAudio.count({ where: { itemId, kind: d.kind, selected: true } });
  if (d.selected || !anySelected) await selectAudio(itemId, row.id); else await touch(itemId);
  return row;
}
/** The parent's default for this clip kind (a blocked clip is unblocked when chosen). */
export async function selectAudio(itemId: string, audioId: string) {
  const a = await prisma.readingAudio.findFirst({ where: { id: audioId, itemId } });
  if (!a) return;
  await prisma.$transaction([
    prisma.readingAudio.updateMany({ where: { itemId, kind: a.kind }, data: { selected: false } }),
    prisma.readingAudio.update({ where: { id: audioId }, data: { selected: true, blocked: false } }),
  ]);
  await touch(itemId);
}
/** Blocked clips never reach the games. Blocking the default moves the default to another allowed clip. */
export async function blockAudio(itemId: string, audioId: string, blocked: boolean) {
  const a = await prisma.readingAudio.findFirst({ where: { id: audioId, itemId } });
  if (!a) return;
  await prisma.readingAudio.update({ where: { id: audioId }, data: { blocked, ...(blocked ? { selected: false } : {}) } });
  if (blocked && a.selected) {
    const other = await prisma.readingAudio.findFirst({ where: { itemId, kind: a.kind, blocked: false }, orderBy: { createdAt: "asc" } });
    if (other) await prisma.readingAudio.update({ where: { id: other.id }, data: { selected: true } });
  }
  await touch(itemId);
}

// ---------------------------------------------------------------- answers (for grades and lesson counts)
export async function firstTries(since: Date) {
  return prisma.readingAttempt.findMany({
    where: { firstTry: true, createdAt: { gte: since } },
    select: { itemId: true, item: true, level: true, correct: true, audio: true, responseMs: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 200000,
  });
}

// ---------------------------------------------------------------- one-time seed (public/reading-seed)
type SeedItem = {
  kind: Kind; text: string; accented: string; accent_checked: boolean; syllables: string; status: string; difficulty: string;
  groups: string[]; phonogram?: string | null; sample?: string | null;
  images: { hash: string; title?: string; artist?: string; license?: string; page?: string; source_url?: string; selected: boolean }[];
  audio: { kind: string; voice: string; hash: string; selected: boolean }[];
};
type Seed = { items: SeedItem[]; media: Record<string, { file: string; mime: string }> };

let seeding: Promise<void> | null = null;
/** Fills an empty database from the seed files shipped with the app. Safe to call often. */
export function ensureSeeded(origin: string): Promise<void> {
  seeding ??= seedOnce(origin).finally(() => { seeding = null; });
  return seeding;
}
async function seedOnce(origin: string) {
  if ((await prisma.readingItem.count()) > 0) return;
  const seed = (await (await fetch(`${origin}/reading-seed/manifest.json`, { cache: "no-store" })).json()) as Seed;
  // Files first, resumable: only the ones not stored yet (a timed-out first run continues here).
  const all = Object.keys(seed.media);
  const have = new Set((await prisma.readingMedia.findMany({ where: { hash: { in: all } }, select: { hash: true } })).map((m) => m.hash));
  const missing = all.filter((h) => !have.has(h));
  for (let i = 0; i < missing.length; i += 40) {
    const chunk = missing.slice(i, i + 40);
    const rows = await Promise.all(chunk.map(async (h) => {
      const r = await fetch(`${origin}/reading-seed/${seed.media[h].file}`);
      return { hash: h, mime: seed.media[h].mime, bytes: new Uint8Array(await r.arrayBuffer()) };
    }));
    await prisma.readingMedia.createMany({ data: rows, skipDuplicates: true });
  }
  // Items, photos and clips in three bulk inserts (ids made here, so sample words link directly).
  const ids = new Map(seed.items.map((it) => [`${it.kind}:${it.text}`, randomUUID()]));
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242001)`;   // two first visitors: only one fills
    if ((await tx.readingItem.count()) > 0) return;
    await tx.readingItem.createMany({ data: seed.items.map((it) => ({
      id: ids.get(`${it.kind}:${it.text}`)!, kind: it.kind, text: it.text, accented: it.accented, accentChecked: it.accent_checked,
      syllables: it.syllables, status: it.status, difficulty: it.difficulty, groups: it.groups, phonogram: it.phonogram ?? null,
      sampleItemId: it.sample ? ids.get(`word:${it.sample}`) ?? null : null,
    })) });
    await tx.readingImage.createMany({ data: seed.items.flatMap((it) => it.images.map((m) => ({
      itemId: ids.get(`${it.kind}:${it.text}`)!, mediaHash: m.hash, source: "commons", title: m.title, artist: m.artist,
      license: m.license, page: m.page, sourceUrl: m.source_url, selected: m.selected }))) });
    await tx.readingAudio.createMany({ data: seed.items.flatMap((it) => it.audio.map((x) => ({
      itemId: ids.get(`${it.kind}:${it.text}`)!, kind: x.kind, voice: x.voice, mediaHash: x.hash, selected: x.selected }))) });
  }, { timeout: 30000, maxWait: 10000 });
}
