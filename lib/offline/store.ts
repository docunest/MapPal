"use client";
// Offline places on the phone (IndexedDB). Downloads resume per chunk (a chunk is ~2 MB): what's
// stored survives closing the app, a dropped hotspot or a reload. Every chunk is checked against
// the manifest's SHA-256 before it's stored. Lookup data from OpenStreetMap — nothing AI.
import type { RoadLayer } from "@/lib/dock/road";
import {
  COUNTRIES,
  cellsAround,
  nearestRows,
  type CountryCode,
  type OfflinePoi,
  type PackEntry,
  type PackManifest,
  type PackRow,
} from "./packs";

const DB = "mappal-offline";

/** What's installed for one country. [version] = the pack's sha256; [done] = chunk sha256s stored. */
export type Installed = {
  cc: CountryCode;
  version: string;
  sourceDate: string;
  count: number;
  bytes: number;
  layers: RoadLayer[];
  cell: number;
  done: string[];
  total: number;
  at: number;
};

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("cells");
      r.result.createObjectStore("packs");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error("aborted"));
  });
}

export async function installed(): Promise<Partial<Record<CountryCode, Installed>>> {
  if (typeof indexedDB === "undefined") return {};
  const d = await db();
  const all = (await req(d.transaction("packs").objectStore("packs").getAll())) as Installed[];
  return Object.fromEntries(all.map((p) => [p.cc, p]));
}

/** A country is usable once every chunk is in. */
export const complete = (p?: Installed) => !!p && p.done.length >= p.total && p.total > 0;

export async function fetchManifest(): Promise<PackManifest> {
  const r = await fetch("/api/offline/poi-manifest.json", { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? "Packs not published yet" : `Manifest HTTP ${r.status}`);
  return r.json();
}

async function gunzipJson(buf: ArrayBuffer): Promise<{ cells: Record<string, PackRow[]> }> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * Download (or update) one country. Chunks already stored for this version are skipped.
 * A new version first removes the old one's places (an update is a fresh download).
 */
export async function install(cc: CountryCode, p: PackEntry, onProgress: (doneBytes: number, totalBytes: number) => void): Promise<void> {
  if (!p.web) throw new Error("This pack has no web data yet");
  const d = await db();
  const have = (await installed())[cc];
  let rec: Installed =
    have && have.version === p.sha256
      ? have
      : {
          cc, version: p.sha256, sourceDate: p.sourceDate, count: p.count, layers: p.web.layers, cell: p.web.cell,
          bytes: p.web.chunks.reduce((s, c) => s + c.bytes, 0), done: [], total: p.web.chunks.length, at: Date.now(),
        };
  if (!have || have.version !== p.sha256) {
    if (have) await removeCells(cc);
    const tx = d.transaction("packs", "readwrite");
    tx.objectStore("packs").put(rec, cc);
    await done(tx);
  }
  const total = rec.bytes;
  let got = p.web.chunks.filter((c) => rec.done.includes(c.sha256)).reduce((s, c) => s + c.bytes, 0);
  onProgress(got, total);
  for (const c of p.web.chunks) {
    if (rec.done.includes(c.sha256)) continue;
    const r = await fetch(`/api/offline/${c.file}?sha=${c.sha256}`);
    if (r.status === 409) throw new Error("Newer data was just published — tap again");
    if (!r.ok) throw new Error(`Download failed (HTTP ${r.status})`);
    const buf = await r.arrayBuffer();
    if (hex(await crypto.subtle.digest("SHA-256", buf)) !== c.sha256) throw new Error("Download damaged — tap again");
    const { cells } = await gunzipJson(buf);
    rec = { ...rec, done: [...rec.done, c.sha256], at: Date.now() };
    const tx = d.transaction(["cells", "packs"], "readwrite");
    const store = tx.objectStore("cells");
    for (const [key, rows] of Object.entries(cells)) store.put(rows, `${cc}:${key}`);
    tx.objectStore("packs").put(rec, cc);
    await done(tx);
    got += c.bytes;
    onProgress(got, total);
  }
}

async function removeCells(cc: CountryCode): Promise<void> {
  const d = await db();
  const tx = d.transaction("cells", "readwrite");
  tx.objectStore("cells").delete(IDBKeyRange.bound(`${cc}:`, `${cc}:￿`));
  await done(tx);
}

export async function remove(cc: CountryCode): Promise<void> {
  await removeCells(cc);
  const d = await db();
  const tx = d.transaction("packs", "readwrite");
  tx.objectStore("packs").delete(cc);
  await done(tx);
}

/** Nearest places per layer around a point, from every complete country. */
export async function nearest(
  lat: number,
  lng: number,
  layers: RoadLayer[],
  radiusM = 30_000,
  limit = 3,
): Promise<Partial<Record<RoadLayer, OfflinePoi[]>>> {
  const packs = Object.values(await installed()).filter(complete) as Installed[];
  if (!packs.length) return {};
  const d = await db();
  const store = d.transaction("cells").objectStore("cells");
  // All reads issued at once: an IndexedDB transaction closes as soon as nothing is pending.
  const reads = packs.map((p) => ({
    p,
    parts: cellsAround(lat, lng, radiusM, p.cell).map((k) => req(store.get(`${p.cc}:${k}`)) as Promise<PackRow[] | undefined>),
  }));
  const rowsByPack = await Promise.all(
    reads.map(async ({ p, parts }) => ({ p, rows: (await Promise.all(parts)).flatMap((x) => x ?? []) })),
  );
  const out: Partial<Record<RoadLayer, OfflinePoi[]>> = {};
  for (const layer of layers) {
    const all = rowsByPack.flatMap(({ p, rows }) => nearestRows(rows, p.layers, layer, lat, lng, radiusM, limit));
    const seen = new Set<string>();
    out[layer] = all.filter((x) => !seen.has(x.osm) && seen.add(x.osm)).sort((a, b) => a.distM - b.distM).slice(0, limit);
  }
  return out;
}

/** Oldest OSM date among installed countries — "data from …" in the UI. */
export function dataDate(packs: Partial<Record<CountryCode, Installed>>): string | null {
  const dates = COUNTRIES.map((c) => packs[c.cc]).filter(complete).map((p) => p!.sourceDate).filter(Boolean).sort();
  return dates[0] ?? null;
}

/** Ask the browser not to clear the data under storage pressure (Safari honours it for Home Screen apps). */
export async function persist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
