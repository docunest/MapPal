// Road ahead (docs/DOCK.md): the route to where the van is going and the POIs along it,
// old-school GPS style — next fuel, rest area, camper services, playground, "cool stuff".
// Route from a free OSM router (OSRM public server), POIs from Overpass in a corridor
// around the route line. All lookup data (OSM), nothing guessed.

export type LatLng = { lat: number; lng: number };

/** POI layers (owner 2026-11-16: all four groups on by default). */
export const ROAD_LAYERS = {
  // Road essentials
  fuel: { icon: "⛽", label: "Fuel", group: "essentials", radius: 1000, q: `nwr[amenity=fuel]` },
  rest: { icon: "🅿️", label: "Rest area / services", group: "essentials", radius: 1000, q: `nwr[highway~"^(rest_area|services)$"]` },
  toilets: { icon: "🚻", label: "Toilets", group: "essentials", radius: 300, q: `nwr[amenity=toilets]` },
  water: { icon: "💧", label: "Drinking water", group: "essentials", radius: 300, q: `nwr[amenity=drinking_water]` },
  grocery: { icon: "🛒", label: "Grocery", group: "essentials", radius: 1500, q: `nwr[shop~"^(supermarket|convenience)$"]` },
  // Camper
  dump: { icon: "🚐", label: "Camper service / dump", group: "camper", radius: 3000, q: `nwr[amenity=sanitary_dump_station]` },
  aire: { icon: "⛺", label: "Aire / campsite", group: "camper", radius: 3000, q: `nwr[tourism~"^(caravan_site|camp_site)$"]` },
  limit: { icon: "⚠️", label: "Height / weight limit", group: "camper", radius: 20, q: `way[highway][~"^(maxheight|maxweight)$"~"."]` },
  // Kids & breaks
  playground: { icon: "🛝", label: "Playground", group: "kids", radius: 600, q: `nwr[leisure=playground]` },
  picnic: { icon: "🧺", label: "Picnic site", group: "kids", radius: 1000, q: `nwr[tourism=picnic_site]` },
  beach: { icon: "🏖️", label: "Beach", group: "kids", radius: 3000, q: `nwr[natural=beach][name]` },
  // Cool stuff (Lens, G3)
  works: { icon: "🏭", label: "Factory / works", group: "cool", radius: 3000, q: `nwr[man_made=works][name]` },
  power: { icon: "⚡", label: "Power plant / wind farm", group: "cool", radius: 5000, q: `nwr[power=plant]` },
  quarry: { icon: "⛏️", label: "Mine / quarry", group: "cool", radius: 3000, q: `nwr[landuse=quarry][name]` },
  dam: { icon: "🌊", label: "Dam", group: "cool", radius: 3000, q: `nwr[waterway=dam][name]` },
  bridge: { icon: "🌉", label: "Named bridge / viaduct", group: "cool", radius: 60, q: `way[bridge][name]` },
  airport: { icon: "✈️", label: "Airport", group: "cool", radius: 8000, q: `nwr[aeroway=aerodrome][name][iata]` },
  castle: { icon: "🏰", label: "Castle", group: "cool", radius: 3000, q: `nwr[historic=castle][name]` },
  viewpoint: { icon: "⛰️", label: "Viewpoint", group: "cool", radius: 2000, q: `nwr[tourism=viewpoint][name]` },
  lighthouse: { icon: "🗼", label: "Lighthouse", group: "cool", radius: 3000, q: `nwr[man_made=lighthouse]` },
} as const;
export type RoadLayer = keyof typeof ROAD_LAYERS;

export type RoadPoi = {
  id: string;
  layer: RoadLayer;
  name: string | null;
  brand: string | null;
  lat: number;
  lng: number;
  /** km from the route start where the POI is level with the road. */
  km: number;
  /** Metres from the route line. */
  offsetM: number;
  /** Side in the driving direction. */
  side: "L" | "R";
  /** Short facts for the strip: "diesel ✓ · 24/7", "height 3.2 m". */
  info: string | null;
};

// --- Geometry (local equirectangular: plenty for metres along a road) -------------------------

const R = 6371000;
const rad = Math.PI / 180;

export function distM(a: LatLng, b: LatLng): number {
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * R;
}

/** Douglas–Peucker in metres. Keeps the first and last point. */
export function simplify(line: LatLng[], tolM: number): LatLng[] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1, bestD = tolM;
    for (let k = i + 1; k < j; k++) {
      const d = pointSegment(line[k], line[i], line[j]).dist;
      if (d > bestD) { bestD = d; best = k; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return line.filter((_, k) => keep[k]);
}

/** Distance from p to segment a–b, how far along it (0..1), and the side (cross sign). */
function pointSegment(p: LatLng, a: LatLng, b: LatLng): { dist: number; t: number; cross: number } {
  const c = Math.cos(a.lat * rad);
  const ax = 0, ay = 0;
  const bx = (b.lng - a.lng) * rad * c * R, by = (b.lat - a.lat) * rad * R;
  const px = (p.lng - a.lng) * rad * c * R, py = (p.lat - a.lat) * rad * R;
  const len2 = bx * bx + by * by;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2)) : 0;
  const dx = px - t * bx, dy = py - t * by;
  return { dist: Math.hypot(dx, dy), t, cross: bx * py - by * px };
}

/** Cumulative metres at each vertex. */
export function cumulative(line: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distM(line[i - 1], line[i]));
  return out;
}

/** Where p is along the line: metres from the start, metres off it, side. */
export function project(line: LatLng[], cum: number[], p: LatLng): { along: number; off: number; side: "L" | "R" } {
  let best = { along: 0, off: Infinity, side: "R" as "L" | "R" };
  for (let i = 1; i < line.length; i++) {
    const s = pointSegment(p, line[i - 1], line[i]);
    if (s.dist < best.off) best = { along: cum[i - 1] + s.t * (cum[i] - cum[i - 1]), off: s.dist, side: s.cross > 0 ? "L" : "R" };
  }
  return best;
}

/** Split the route into pieces of ≤ [maxM] metres (each a few dozen points) for the Overpass corridor. */
export function chunks(line: LatLng[], maxM = 60_000, maxPts = 120): LatLng[][] {
  const out: LatLng[][] = [];
  let cur: LatLng[] = [line[0]];
  let len = 0;
  for (let i = 1; i < line.length; i++) {
    len += distM(line[i - 1], line[i]);
    cur.push(line[i]);
    if (len >= maxM || cur.length >= maxPts) {
      out.push(cur);
      cur = [line[i]];
      len = 0;
    }
  }
  if (cur.length > 1 || !out.length) out.push(cur);
  return out;
}

// --- Overpass ---------------------------------------------------------------------------------

/** One Overpass query for a route piece: every layer with its own corridor width. */
export function overpassQuery(piece: LatLng[], layers: RoadLayer[]): string {
  const poly = piece.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(",");
  const parts = layers.map((l) => `${ROAD_LAYERS[l].q}(around:${ROAD_LAYERS[l].radius},${poly});`);
  return `[out:json][timeout:25];(${parts.join("")});out center tags 400;`;
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Which layer an OSM element belongs to (the first that matches, in ROAD_LAYERS order). */
/** Fuels that mean "not a diesel station" when they are all a station lists. */
const GAS_ONLY = new Set(["cng", "lng", "biogas", "h2", "hydrogen", "electricity"]);

/**
 * Owner 2026-11-16: "I only care about diesel" (no EV chargers, no AdBlue). Chargers are a different
 * OSM tag and never come in. Drop fuel:diesel=no and stations listing only CNG/LNG/hydrogen/power —
 * NOT ones listing only LPG/AdBlue: in Portugal 334 normal Repsol/Galp/BP stations carry just
 * fuel:lpg=yes (mappers note the extra, not the diesel).
 */
export function dieselMaybe(t: Record<string, string>): boolean {
  if (t["fuel:diesel"] === "yes" || t["fuel:HGV_diesel"] === "yes") return true;
  if (t["fuel:diesel"] === "no") return false;
  const listed = Object.entries(t).filter(([k, v]) => k.startsWith("fuel:") && v === "yes").map(([k]) => k.slice(5));
  return listed.length === 0 || listed.some((f) => !GAS_ONLY.has(f));
}

export function layerOf(t: Record<string, string>): RoadLayer | null {
  if (t.amenity === "fuel") return dieselMaybe(t) ? "fuel" : null;
  if (t.highway === "rest_area" || t.highway === "services") return "rest";
  if (t.amenity === "sanitary_dump_station") return "dump";
  if (t.tourism === "caravan_site" || t.tourism === "camp_site") return "aire";
  if (t.highway && (t.maxheight || t.maxweight)) return "limit";
  if (t.amenity === "toilets") return "toilets";
  if (t.amenity === "drinking_water") return "water";
  if (t.shop === "supermarket" || t.shop === "convenience") return "grocery";
  if (t.leisure === "playground") return "playground";
  if (t.tourism === "picnic_site") return "picnic";
  if (t.natural === "beach") return "beach";
  if (t.man_made === "works") return "works";
  if (t.power === "plant") return "power";
  if (t.landuse === "quarry") return "quarry";
  if (t.waterway === "dam") return "dam";
  if (t.bridge && t.name) return "bridge";
  if (t.aeroway === "aerodrome") return "airport";
  if (t.historic === "castle") return "castle";
  if (t.tourism === "viewpoint") return "viewpoint";
  if (t.man_made === "lighthouse") return "lighthouse";
  return null;
}

/** "diesel ✓ · 24/7", "height 3.5 m", "wind". */
export function infoOf(layer: RoadLayer, t: Record<string, string>): string | null {
  const bits: string[] = [];
  if (layer === "fuel" && (t["fuel:diesel"] === "yes" || t["fuel:HGV_diesel"] === "yes")) bits.push("diesel ✓");
  if (layer === "limit") {
    if (t.maxheight) bits.push(`height ${t.maxheight}${/^[\d.]+$/.test(t.maxheight) ? " m" : ""}`);
    if (t.maxweight) bits.push(`weight ${t.maxweight}${/^[\d.]+$/.test(t.maxweight) ? " t" : ""}`);
  }
  if (layer === "power" && t["plant:source"]) bits.push(t["plant:source"]);
  if (layer === "rest" && t.highway === "services") bits.push("services");
  if (layer === "aire" && t.tourism === "caravan_site") bits.push("aire");
  if (t.opening_hours === "24/7") bits.push("24/7");
  return bits.length ? bits.join(" · ") : null;
}

/** OSM elements → POIs placed along the route (dupes and far ones dropped). */
export function placePois(els: OsmEl[], line: LatLng[], cum: number[]): RoadPoi[] {
  const seen = new Set<string>();
  const out: RoadPoi[] = [];
  for (const e of els) {
    const t = e.tags ?? {};
    const layer = layerOf(t);
    if (!layer) continue;
    const at = e.center ? { lat: e.center.lat, lng: e.center.lon } : e.lat != null && e.lon != null ? { lat: e.lat, lng: e.lon } : null;
    if (!at) continue;
    const key = `${e.type}/${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pr = project(line, cum, at);
    if (pr.off > ROAD_LAYERS[layer].radius * 1.2 + 50) continue;
    out.push({
      id: key,
      layer,
      name: t.name ?? t["name:es"] ?? t["name:pt"] ?? null,
      brand: t.brand ?? t.operator ?? null,
      lat: at.lat,
      lng: at.lng,
      km: Math.round(pr.along / 100) / 10,
      offsetM: Math.round(pr.off),
      side: pr.side,
      info: infoOf(layer, t),
    });
  }
  return out.sort((a, b) => a.km - b.km);
}

// --- Fetching ---------------------------------------------------------------------------------

const UA = "MapPal-dock/1.0 (road ahead)";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** Driving route from the OSRM public server: the line (simplified to ~25 m) and totals. */
export async function osrmRoute(from: LatLng, to: LatLng, fetchFn: typeof fetch = fetch) {
  const u = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetchFn(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`router ${res.status}`);
  const j = (await res.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }> };
  const r = j.routes?.[0];
  if (!r) throw new Error(`no route (${j.code ?? "?"})`);
  const full = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  return { distanceM: Math.round(r.distance), durationS: Math.round(r.duration), line: simplify(full, 25) };
}

async function overpass(q: string, fetchFn: typeof fetch): Promise<OsmEl[]> {
  let last = "";
  for (const url of OVERPASS) {
    try {
      const res = await fetchFn(url, { method: "POST", body: new URLSearchParams({ data: q }), headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return ((await res.json()) as { elements?: OsmEl[] }).elements ?? [];
      last = `${res.status}`;
    } catch (err) {
      last = String(err);
    }
  }
  throw new Error(`overpass ${last}`);
}

/** POIs along the whole route: pieces 3 at a time; a failed piece is reported, not fatal. */
export async function corridorPois(line: LatLng[], layers: RoadLayer[], fetchFn: typeof fetch = fetch) {
  const cum = cumulative(line);
  // The corridor itself on a coarser line (≈ 150 m): Overpass works per vertex.
  const coarse = simplify(line, 150);
  const pieces = chunks(coarse);
  const els: OsmEl[] = [];
  const failed: number[] = [];
  for (let i = 0; i < pieces.length; i += 3) {
    const batch = pieces.slice(i, i + 3);
    const res = await Promise.allSettled(batch.map((p) => overpass(overpassQuery(p, layers), fetchFn)));
    res.forEach((r, k) => (r.status === "fulfilled" ? els.push(...r.value) : failed.push(i + k)));
  }
  return { pois: placePois(els, line, cum), pieces: pieces.length, failedPieces: failed };
}
