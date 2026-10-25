// Sightseeing orchestrator: "there's a steelworks 1.2 km away, a fish
// auction 600 m away". Asks every sights source (OSM, Wikipedia), merges what
// they found into one card per real thing, adds names/fame/photos from
// enrichment sources (Wikidata), classifies, and ranks by how visible and
// how interesting each one is.
import { bearingDegrees, compassLabel, distanceMeters, type LatLng } from "../geo";
import { commonsThumb } from "../wikimedia";
import type { Enrichment, Provenance, SightCandidate, Source, SourceContext, SourceNote, SightsQuery, WikiRef } from "../sources/types";
import { classifyFromTexts, classifyTags, type SightGroup, type SightKind } from "./sightKinds";

export interface Sight {
  key: string;
  name: string;
  localName?: string;
  kind: string;
  kindLabel: string;
  icon: string;
  group: SightGroup;
  lat: number;
  lng: number;
  distance: number;
  bearing: number;
  compass: string;
  description?: string;
  /** Set when the description isn't in the reader's language. */
  descriptionLang?: string;
  image?: string;
  wikidata?: string;
  wiki: WikiRef[];
  osm?: string;
  fame: number;
  score: number;
  sources: Provenance[];
}

export interface SightsResult {
  sights: Sight[];
  notes: SourceNote[];
}

interface Merged {
  key: string;
  lat: number;
  lng: number;
  distance: number;
  names: string[];
  localName?: string;
  tags?: Record<string, string>;
  osm?: string;
  wikidata?: string;
  wiki: WikiRef[];
  descriptions: Array<{ text: string; lang?: string }>;
  images: Array<{ url: string; lang?: string }>;
  sources: Provenance[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function addSource(list: Provenance[], p: Provenance) {
  if (!list.some((x) => x.source === p.source)) list.push(p);
}

/** One record per real thing: same Wikidata id, or same name within 300 m. Pure. */
export function mergeSightCandidates(candidates: SightCandidate[]): Merged[] {
  const out: Merged[] = [];
  const byKey = new Map<string, Merged>();
  for (const c of [...candidates].sort((a, b) => (a.source === "osm" ? -1 : 1) - (b.source === "osm" ? -1 : 1))) {
    let m =
      byKey.get(c.wikidata ?? c.key) ??
      (c.name
        ? out.find((o) => !(o.wikidata && c.wikidata) && o.names.some((n) => norm(n) === norm(c.name!)) && distanceMeters(o, c) < 300)
        : undefined);
    if (!m) {
      m = { key: c.wikidata ?? c.key, lat: c.lat, lng: c.lng, distance: c.distance, names: [], wiki: [], descriptions: [], images: [], sources: [] };
      out.push(m);
    }
    byKey.set(c.wikidata ?? c.key, m);
    // OSM geometry (nearest bank / building) beats a Wikipedia pin.
    if (c.source === "osm" && (!m.tags || c.distance < m.distance)) {
      m.lat = c.lat;
      m.lng = c.lng;
      m.distance = c.distance;
    } else if (!m.tags && c.distance < m.distance) {
      m.lat = c.lat;
      m.lng = c.lng;
      m.distance = c.distance;
    }
    if (c.name && !m.names.includes(c.name)) m.names.push(c.name);
    m.localName ??= c.localName;
    if (c.tags && !m.tags) {
      m.tags = c.tags;
      m.osm = c.osm;
    }
    m.wikidata ??= c.wikidata;
    if (c.wiki && !m.wiki.some((w) => w.lang === c.wiki!.lang)) m.wiki.push(c.wiki);
    if (c.description) m.descriptions.push({ text: c.description, lang: c.descriptionLang });
    if (c.image) m.images.push({ url: c.image, lang: c.descriptionLang });
    addSource(m.sources, { source: c.source, url: c.url });
  }
  return out;
}

function imageFromTags(t: Record<string, string> | undefined): string | undefined {
  const commons = t?.wikimedia_commons;
  if (commons?.startsWith("File:")) return commonsThumb(commons, 480);
  if (t?.image?.startsWith("https://upload.wikimedia.org/")) return t.image;
  if (t?.image?.startsWith("File:")) return commonsThumb(t.image, 480);
  return undefined;
}

function scoreSight(kind: SightKind, distance: number, radius: number, hasArticle: boolean, fame: number, hasImage: boolean, boost: number): number {
  const visible = Math.min(kind.visibleM, radius);
  // Beyond where you'd notice it: keep notable ones at a low score, drop the rest.
  const proximity = distance <= visible ? Math.pow(1 - distance / (visible * 1.15), 0.6) : hasArticle ? 0.08 : 0;
  if (proximity <= 0) return 0;
  const notability = (hasArticle ? 1 : 0.55) + Math.min(0.5, Math.log10(1 + fame) * 0.35) + (hasImage ? 0.1 : 0);
  return kind.weight * notability * proximity * boost;
}

export interface RankOptions {
  center: LatLng;
  radius: number;
  userLang: string;
  localLangs: string[];
  /** From likes: per-kind multiplier (1 = neutral). */
  kindBoost?: Record<string, number>;
}

/** Classify + rank merged records. Pure — tested on real Iberian data. */
export function rankSights(merged: Merged[], enrichment: Record<string, Enrichment>, opts: RankOptions): Sight[] {
  const { center, radius, userLang, localLangs } = opts;
  const sights: Sight[] = [];
  for (const m of merged) {
    const e = m.wikidata ? enrichment[m.wikidata] : undefined;
    const userDesc = e?.description ?? m.descriptions.find((d) => d.lang === userLang)?.text;
    const anyDesc = userDesc ?? m.descriptions[0]?.text;
    const kind =
      (m.tags ? classifyTags(m.tags) : null) ??
      classifyFromTexts([...m.names, m.localName], [userDesc, ...m.descriptions.map((d) => d.text)]);
    if (!kind) continue;

    const wiki = [...m.wiki];
    for (const w of e?.wiki ?? []) if (!wiki.some((x) => x.lang === w.lang)) wiki.push(w);
    if (m.tags?.wikipedia) {
      const t = /^([a-z-]{2,12}):(.+)$/.exec(m.tags.wikipedia);
      if (t && !wiki.some((x) => x.lang === t[1])) wiki.push({ lang: t[1], title: t[2] });
    }
    const hasArticle = wiki.length > 0;
    // A generic "landmark" with no article anywhere isn't worth a card.
    if (kind.slug === "landmark" && !hasArticle) continue;

    const userTitle = wiki.find((w) => w.lang === userLang)?.title.replace(/ \([^)]*\)$/, "");
    const name = e?.label ?? m.tags?.[`name:${userLang}`] ?? userTitle ?? m.names[0] ?? m.localName;
    if (!name) continue;
    const localTitle = wiki.find((w) => localLangs.includes(w.lang))?.title.replace(/ \([^)]*\)$/, "");
    const localName = m.localName ?? localTitle;

    const image =
      m.images.find((i) => i.lang === userLang)?.url ?? m.images[0]?.url ?? imageFromTags(m.tags) ?? e?.image;
    const fame = e?.fame ?? (hasArticle ? 2 : 0);
    const sources = [...m.sources];
    if (e) addSource(sources, { source: "wikidata", url: `https://www.wikidata.org/wiki/${m.wikidata}` });

    const score = scoreSight(kind, m.distance, radius, hasArticle, fame, !!image, opts.kindBoost?.[kind.slug] ?? 1);
    if (score <= 0) continue;
    const bearing = bearingDegrees(center, m);
    sights.push({
      key: m.key,
      name,
      localName: localName && norm(localName) !== norm(name) ? localName : undefined,
      kind: kind.slug,
      kindLabel: kind.label,
      icon: kind.icon,
      group: kind.group,
      lat: m.lat,
      lng: m.lng,
      distance: Math.round(m.distance),
      bearing: Math.round(bearing),
      compass: compassLabel(bearing),
      description: anyDesc,
      descriptionLang: userDesc ? undefined : m.descriptions[0]?.lang,
      image,
      wikidata: m.wikidata,
      wiki,
      osm: m.osm,
      fame,
      score: Math.round(score * 1000) / 1000,
      sources,
    });
  }
  sights.sort((a, b) => b.score - a.score);
  // Same name close by = same thing seen twice without a shared Wikidata id.
  const deduped: Sight[] = [];
  for (const s of sights) {
    if (!deduped.some((d) => norm(d.name) === norm(s.name) && distanceMeters(d, s) < 400)) deduped.push(s);
  }
  return deduped.slice(0, 48);
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

export async function findSights(
  q: SightsQuery,
  sources: { sights: Source[]; enrich: Source[] },
  ctx: SourceContext,
  kindBoost?: Record<string, number>,
): Promise<SightsResult> {
  const notes: SourceNote[] = [];
  const lists = await Promise.all(
    sources.sights.map(async (s) => {
      try {
        const found = await s.sights!(q, ctx);
        notes.push({ source: s.meta.id, status: found.length ? "ok" : "empty", message: `${found.length} candidates` });
        return found;
      } catch (err) {
        notes.push({ source: s.meta.id, status: "failed", message: errText(err) });
        return [];
      }
    }),
  );
  if (!lists.some((l) => l.length) && notes.every((n) => n.status === "failed")) {
    throw new Error(`No sights source answered: ${notes.map((n) => `${n.source}: ${n.message}`).join("; ")}`);
  }

  const merged = mergeSightCandidates(lists.flat());
  const qids = [...new Set(merged.map((m) => m.wikidata).filter((x): x is string => !!x))];
  const enrichment: Record<string, Enrichment> = {};
  for (const s of sources.enrich) {
    if (!qids.length) break;
    try {
      Object.assign(enrichment, await s.enrich!(qids, q, ctx));
      notes.push({ source: s.meta.id, status: "ok", message: `${Object.keys(enrichment).length} enriched` });
    } catch (err) {
      notes.push({ source: s.meta.id, status: "failed", message: errText(err) });
    }
  }

  return {
    sights: rankSights(merged, enrichment, { ...q, kindBoost }),
    notes,
  };
}
