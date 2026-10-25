// "Can we actually get there?" — road access around a spot, read from OSM:
// private/no-vehicle roads, gates, rough tracks, height/weight limits that
// matter for a camper van, plus where to park and where to sleep nearby.
// It's map data, not live closures — the report says so.
import { distanceMeters, formatDistance, nearestOnPolyline, type LatLng } from "../geo";
import { elementLatLng, MAPPAL_USER_AGENT, overpassQuery, type OverpassElement } from "../overpass";

type Tags = Record<string, string>;

const DRIVABLE = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street",
  "service", "road", "track", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
]);
const FOOT = new Set(["path", "footway", "steps", "bridleway", "cycleway", "pedestrian"]);

const RESTRICTED = new Set(["no", "private", "agricultural", "forestry", "delivery", "military", "emergency", "official", "use_sidepath"]);
const DESTINATION_ONLY = new Set(["destination", "customers", "permit"]);

export type CarAccess = "yes" | "destination" | "restricted";

/** Most specific access tag wins: motorcar > motor_vehicle > vehicle > access. */
export function carAccess(t: Tags): CarAccess {
  const highwayDefault = t.highway === "pedestrian" ? "no" : undefined;
  const v = t.motorcar ?? t.motor_vehicle ?? t.vehicle ?? t.access ?? highwayDefault;
  if (!v) return "yes";
  if (RESTRICTED.has(v)) return "restricted";
  if (DESTINATION_ONLY.has(v)) return "destination";
  return "yes";
}

/** 0 = paved, 1 = decent gravel, 2 = rough (slow, scrapes), 3 = 4x4 only. */
export function roughness(t: Tags): number {
  if (t["4wd_only"] === "yes" || t.tracktype === "grade5" || /^(horrible|very_horrible|impassable)$/.test(t.smoothness ?? "")) return 3;
  if (/^(grade3|grade4)$/.test(t.tracktype ?? "") || /^(bad|very_bad)$/.test(t.smoothness ?? "") || /^(dirt|earth|ground|mud|grass|sand|rock)$/.test(t.surface ?? "")) return 2;
  if (t.highway === "track" || /^(grade1|grade2)$/.test(t.tracktype ?? "") || /^(gravel|fine_gravel|compacted|unpaved|pebblestone)$/.test(t.surface ?? "")) return 1;
  return 0;
}

const ROUGHNESS_TEXT = ["paved", "gravel/track", "rough track", "4×4 only"];

/** "2.5", "2.5 m", "8'2\"" → meters; tonnes for weight. */
export function parseLimit(v: string | undefined): number | undefined {
  if (!v || v === "none" || v === "default") return undefined;
  const ft = /^(\d+)'(?:(\d+)")?$/.exec(v.trim());
  if (ft) return Math.round((Number(ft[1]) * 0.3048 + Number(ft[2] ?? 0) * 0.0254) * 100) / 100;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export interface Vehicle {
  heightM: number;
  weightT: number;
  widthM: number;
}

export const DEFAULT_VEHICLE: Vehicle = { heightM: 3.0, weightT: 3.5, widthM: 2.3 };

function limitWarnings(t: Tags, vehicle: Vehicle): string[] {
  const w: string[] = [];
  const h = parseLimit(t.maxheight ?? t["maxheight:physical"]);
  const wt = parseLimit(t.maxweight ?? t["maxweightrating"]);
  const wd = parseLimit(t.maxwidth ?? t["maxwidth:physical"]);
  if (h !== undefined && h < vehicle.heightM + 0.1) w.push(`Height limit ${h} m`);
  if (wt !== undefined && wt < vehicle.weightT + 0.01) w.push(`Weight limit ${wt} t`);
  if (wd !== undefined && wd < vehicle.widthM + 0.2) w.push(`Width limit ${wd} m`);
  if (t.hgv === "no" && vehicle.weightT > 3.5) w.push("No heavy vehicles");
  return w;
}

function conditionalText(t: Tags): string[] {
  return Object.entries(t)
    .filter(([k]) => /^(access|vehicle|motor_vehicle|motorcar):conditional$/.test(k))
    .map(([, v]) => `Conditional restriction: ${v}`);
}

interface Road {
  id: number;
  tags: Tags;
  line: LatLng[];
  distance: number;
  access: CarAccess;
  rough: number;
}

export interface AccessPlace {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  distance: number;
  badges: string[];
}

export interface AccessReport {
  verdict: "drive" | "park-walk" | "hike" | "restricted" | "unknown";
  headline: string;
  details: string[];
  warnings: string[];
  drive?: { km: number; minutes: number; snapM: number };
  parking: AccessPlace[];
  overnight: AccessPlace[];
  links: Record<string, string>;
  caveat: string;
}

export function buildAccessQuery({ lat, lng }: LatLng): string {
  const at = `${lat},${lng}`;
  return `[out:json][timeout:25];
way(around:600,${at})["highway"]->.roads;
.roads out tags geom qt;
node(w.roads)["barrier"];
out body qt;
nwr(around:2500,${at})["amenity"="parking"];
out tags center qt;
(
  nwr(around:20000,${at})["tourism"~"^(camp_site|caravan_site)$"];
  nwr(around:20000,${at})["amenity"="parking"]["motorhome"~"^(yes|designated)$"];
);
out tags center qt;`;
}

function placeBadges(t: Tags): string[] {
  const b: string[] = [];
  if (t.fee === "no") b.push("Free");
  if (t.fee === "yes") b.push("Fee");
  if (/^(yes|designated)$/.test(t.motorhome ?? "") || /^(yes|designated)$/.test(t.caravans ?? "")) b.push("Motorhomes OK");
  if (t.motorhome === "no") b.push("No motorhomes");
  const h = parseLimit(t.maxheight);
  if (h !== undefined) b.push(`Max height ${h} m`);
  if (t.capacity) b.push(`${t.capacity} spaces`);
  if (t.surface && !/^(asphalt|paved|concrete)$/.test(t.surface)) b.push(t.surface.replace(/_/g, " "));
  if (t.access && !/^(yes|public|permissive)$/.test(t.access)) b.push(`Access: ${t.access}`);
  if (t.opening_hours) b.push(t.opening_hours);
  if (t.backcountry === "yes") b.push("Wild/backcountry");
  if (/^(yes|designated)$/.test(t.drinking_water ?? "")) b.push("Water");
  if (/^(yes)$/.test(t.sanitary_dump_station ?? "")) b.push("Dump station");
  return b;
}

/** Pure analysis over Overpass elements — tested with fixtures. */
export function analyzeAccess(
  spot: LatLng,
  elements: OverpassElement[],
  vehicle: Vehicle = DEFAULT_VEHICLE,
): Omit<AccessReport, "drive" | "links" | "caveat"> {
  const roads: Road[] = [];
  const barriers: Array<{ tags: Tags; lat: number; lng: number }> = [];
  const parking: AccessPlace[] = [];
  const overnight: AccessPlace[] = [];

  for (const el of elements) {
    const t = el.tags ?? {};
    if (el.type === "way" && t.highway && el.geometry?.length) {
      const line = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
      roads.push({
        id: el.id,
        tags: t,
        line,
        distance: nearestOnPolyline(spot, line).distance,
        access: carAccess(t),
        rough: roughness(t),
      });
      continue;
    }
    if (el.type === "node" && t.barrier && el.lat !== undefined && el.lon !== undefined) {
      barriers.push({ tags: t, lat: el.lat, lng: el.lon });
      continue;
    }
    const p = elementLatLng(el);
    if (!p) continue;
    const d = Math.round(distanceMeters(spot, p));
    if (t.tourism === "camp_site" || t.tourism === "caravan_site" || (t.amenity === "parking" && /^(yes|designated)$/.test(t.motorhome ?? ""))) {
      overnight.push({
        name: t.name ?? (t.tourism === "camp_site" ? "Campsite" : t.tourism === "caravan_site" ? "Motorhome site" : "Motorhome parking"),
        kind: t.tourism ?? "motorhome_parking",
        lat: p.lat,
        lng: p.lng,
        distance: d,
        badges: placeBadges(t),
      });
    }
    if (t.amenity === "parking" && d <= 2500 && t.access !== "private" && t.access !== "no") {
      parking.push({ name: t.name ?? "Parking", kind: "parking", lat: p.lat, lng: p.lng, distance: d, badges: placeBadges(t) });
    }
  }

  parking.sort((a, b) => a.distance - b.distance);
  overnight.sort((a, b) => a.distance - b.distance);

  const details: string[] = [];
  const warnings: string[] = [];
  const drivable = roads.filter((r) => DRIVABLE.has(r.tags.highway)).sort((a, b) => a.distance - b.distance);
  const legal = drivable.filter((r) => r.access !== "restricted" && r.rough < 3);
  const nearestAny = drivable[0];
  const nearestLegal = legal[0];
  const nearestFoot = roads.filter((r) => FOOT.has(r.tags.highway)).sort((a, b) => a.distance - b.distance)[0];

  const roadName = (r: Road) => r.tags.name ?? r.tags.ref ?? (r.tags.highway === "track" ? "a track" : `a ${r.tags.highway.replace(/_/g, " ")} road`);

  if (!roads.length) {
    return {
      verdict: "unknown",
      headline: "No mapped roads or paths within 600 m",
      details: ["OpenStreetMap has no roads or paths here — it may be very remote, or just unmapped."],
      warnings,
      parking: parking.slice(0, 3),
      overnight: overnight.slice(0, 4),
    };
  }

  let verdict: AccessReport["verdict"];
  let headline: string;

  if (nearestLegal && nearestLegal.distance <= 150) {
    verdict = "drive";
    headline = `Drive right up — ${roadName(nearestLegal)} is ${formatDistance(nearestLegal.distance)} away`;
    if (nearestLegal.rough > 0) details.push(`That road is ${ROUGHNESS_TEXT[nearestLegal.rough]} (${nearestLegal.tags.surface ?? nearestLegal.tags.tracktype ?? "unpaved"}).`);
    if (nearestLegal.access === "destination") details.push("Access is for destination traffic only — fine for visiting, not for through traffic.");
  } else if (nearestLegal && nearestLegal.distance <= 2000) {
    verdict = "park-walk";
    const walkMin = Math.max(1, Math.round((nearestLegal.distance * 1.3) / 75));
    headline = `Park and walk ~${walkMin} min — nearest public road is ${formatDistance(nearestLegal.distance)} away`;
    if (nearestFoot && nearestFoot.distance < 100) details.push(`A ${nearestFoot.tags.highway} passes within ${formatDistance(nearestFoot.distance)} of the spot.`);
  } else if (nearestFoot && nearestFoot.distance < 150) {
    verdict = "hike";
    headline = "Footpath only — no public road within 600 m";
    details.push(`Nearest path (${nearestFoot.tags.name ?? nearestFoot.tags.highway}) is ${formatDistance(nearestFoot.distance)} from the spot.`);
  } else {
    verdict = nearestAny ? "restricted" : "hike";
    headline = nearestAny ? "Only private / closed roads nearby" : "No road or path close by — off-trail";
  }

  if (nearestAny && nearestAny.access === "restricted" && (!nearestLegal || nearestAny.distance + 100 < nearestLegal.distance)) {
    const value = nearestAny.tags.motorcar ?? nearestAny.tags.motor_vehicle ?? nearestAny.tags.vehicle ?? nearestAny.tags.access;
    details.push(
      `The closest road (${roadName(nearestAny)}, ${formatDistance(nearestAny.distance)}) is marked "${value}" for cars${nearestLegal ? ` — the nearest legal one is ${formatDistance(nearestLegal.distance)} away` : ""}.`,
    );
    if (verdict === "drive") verdict = "park-walk";
  }

  // Check the roads someone would actually use to reach the spot.
  const relevant = drivable.filter((r) => r.distance <= Math.max(300, (nearestLegal?.distance ?? 0) + 150));
  const warned = new Set<string>();
  for (const r of relevant) {
    for (const w of [...limitWarnings(r.tags, vehicle), ...conditionalText(r.tags)]) {
      if (!warned.has(w)) {
        warned.add(w);
        warnings.push(`${w} on ${roadName(r)}`);
      }
    }
    if (r.rough >= 2 && !warned.has(`rough:${r.id}`) && r === nearestLegal) {
      warned.add(`rough:${r.id}`);
      warnings.push(`${roadName(r)} is a ${ROUGHNESS_TEXT[r.rough]} — slow going in a camper`);
    }
    if (r.tags.seasonal && r.tags.seasonal !== "no") warnings.push(`${roadName(r)} is seasonal (${r.tags.seasonal})`);
    if (r.tags.toll === "yes") warnings.push(`${roadName(r)} is a toll road`);
  }

  // Barriers that sit on those roads.
  const relevantPoints = new Set(relevant.flatMap((r) => r.line.map((p) => `${p.lat},${p.lng}`)));
  for (const b of barriers) {
    if (!relevantPoints.has(`${b.lat},${b.lng}`)) continue;
    const kind = b.tags.barrier.replace(/_/g, " ");
    const gateAccess = carAccess(b.tags);
    const d = formatDistance(distanceMeters(spot, b));
    if (b.tags.barrier === "height_restrictor") {
      warnings.push(`Height barrier (${b.tags.maxheight ?? "?"} m) ${d} from the spot`);
    } else if (/^(bollard|block|jersey_barrier|chain|log)$/.test(b.tags.barrier) && gateAccess !== "yes") {
      warnings.push(`${kind[0].toUpperCase()}${kind.slice(1)} blocks cars ${d} from the spot`);
    } else if (/gate|lift_gate|swing_gate|barrier/.test(b.tags.barrier)) {
      warnings.push(`${kind[0].toUpperCase()}${kind.slice(1)} ${d} from the spot${gateAccess === "restricted" ? " (private / locked)" : b.tags.access ? ` (${b.tags.access})` : ""}`);
    }
  }

  return { verdict, headline, details, warnings, parking: parking.slice(0, 3), overnight: overnight.slice(0, 4) };
}

async function osrmDrive(from: LatLng, to: LatLng): Promise<AccessReport["drive"] | undefined> {
  // OSRM's public demo server: free, fair use. Car profile honours
  // access=private/no, so the snap distance says how close a car can get.
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&steps=false`;
  const res = await fetch(url, { headers: { "User-Agent": MAPPAL_USER_AGENT }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return undefined;
  const json = (await res.json()) as {
    code: string;
    routes?: Array<{ distance: number; duration: number }>;
    waypoints?: Array<{ distance: number }>;
  };
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) return undefined;
  return {
    km: Math.round(route.distance / 100) / 10,
    minutes: Math.round(route.duration / 60),
    snapM: Math.round(json.waypoints?.[1]?.distance ?? 0),
  };
}

export function accessLinks({ lat, lng }: LatLng): Record<string, string> {
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lng}&zoom=18&basemap=satellite`,
    streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`,
    mapillary: `https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17`,
  };
}

export async function runAccessCheck(spot: LatLng, from?: LatLng, vehicle?: Vehicle): Promise<AccessReport> {
  const [elements, drive] = await Promise.all([
    overpassQuery(buildAccessQuery(spot), { timeoutMs: 20000, totalBudgetMs: 30000 }),
    from ? osrmDrive(from, spot).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const report = analyzeAccess(spot, elements, vehicle);
  if (drive && drive.snapM > 250 && report.verdict === "drive") {
    // Routing can't legally get close even though a road is mapped nearby
    // (e.g. a one-way or a turn restriction) — be conservative.
    report.verdict = "park-walk";
  }
  if (drive) {
    report.details.unshift(
      `${drive.minutes < 60 ? `${drive.minutes} min` : `${Math.floor(drive.minutes / 60)} h ${drive.minutes % 60} min`} drive (${drive.km} km) from you${drive.snapM > 150 ? `; car routing ends ${formatDistance(drive.snapM)} short of the spot` : ""}.`,
    );
  }
  return {
    ...report,
    drive,
    links: accessLinks(spot),
    caveat: "From OpenStreetMap — not live. Check Google Maps for current closures, and satellite/Street View for whether the last bit is camper-friendly.",
  };
}
