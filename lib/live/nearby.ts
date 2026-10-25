// Nearby essentials: the food / fuel / groceries / camp-services run.
// One Overpass round trip for every category at a sensible starting radius,
// then wider rounds only for the categories that came back thin — in a city
// 2 km is plenty of restaurants, on a mountain pass the nearest fuel may be
// 25 km away.
import { bearingDegrees, compassLabel, distanceMeters, type LatLng } from "../geo";
import { elementLatLng, overpassQuery, type OverpassElement } from "../overpass";

export const ESSENTIAL_CATEGORIES = ["food", "fuel", "groceries", "camp", "services"] as const;
export type EssentialCategory = (typeof ESSENTIAL_CATEGORIES)[number];

interface CategoryConfig {
  label: string;
  icon: string;
  startRadius: number;
  maxRadius: number;
  minResults: number;
  clauses: (around: string, r: number, at: string) => string[];
}

export const CATEGORY_CONFIG: Record<EssentialCategory, CategoryConfig> = {
  food: {
    label: "Eat",
    icon: "🍽️",
    startRadius: 2000,
    maxRadius: 15000,
    minResults: 10,
    clauses: (a) => [
      `nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|biergarten|ice_cream)$"]["name"]${a}`,
      `nwr["amenity"="pub"]["food"="yes"]${a}`,
      `nwr["amenity"="pub"]["cuisine"]${a}`,
    ],
  },
  fuel: {
    label: "Fuel",
    icon: "⛽",
    startRadius: 5000,
    maxRadius: 30000,
    minResults: 5,
    clauses: (a) => [`nwr["amenity"="fuel"]${a}`],
  },
  groceries: {
    label: "Groceries",
    icon: "🛒",
    startRadius: 3000,
    maxRadius: 20000,
    minResults: 6,
    clauses: (a) => [
      `nwr["shop"~"^(supermarket|convenience|bakery|butcher|greengrocer|farm|general|deli|cheese|seafood)$"]${a}`,
      `nwr["amenity"="marketplace"]${a}`,
    ],
  },
  camp: {
    label: "Camp",
    icon: "🚐",
    startRadius: 8000,
    maxRadius: 40000,
    minResults: 6,
    clauses: (a, r, at) => [
      `nwr["amenity"~"^(drinking_water|water_point|sanitary_dump_station|shower)$"]${a}`,
      `nwr["man_made"="water_tap"]["drinking_water"="yes"]${a}`,
      `nwr["tourism"~"^(camp_site|caravan_site)$"]${a}`,
      `nwr["shop"~"^(laundry|gas)$"]${a}`,
      `nwr["amenity"="parking"]["motorhome"~"^(yes|designated)$"]${a}`,
      // Public toilets are everywhere in towns; never pull in 40 km of them.
      `nwr["amenity"="toilets"](around:${Math.min(r, 5000)},${at})`,
    ],
  },
  services: {
    label: "Services",
    icon: "💊",
    startRadius: 3000,
    maxRadius: 20000,
    minResults: 4,
    clauses: (a) => [
      `nwr["amenity"~"^(pharmacy|atm|hospital|veterinary)$"]${a}`,
      `nwr["amenity"="bank"]["atm"="yes"]${a}`,
    ],
  },
};

export interface NearbyPlace {
  id: string;
  category: EssentialCategory;
  kind: string;
  kindLabel: string;
  icon: string;
  name: string;
  brand?: string;
  lat: number;
  lng: number;
  distance: number;
  bearing: number;
  compass: string;
  openingHours?: string;
  badges: string[];
  detail?: string;
  phone?: string;
  website?: string;
}

interface KindInfo {
  category: EssentialCategory;
  kind: string;
  label: string;
  icon: string;
  /** Used when the element has no name (fuel stations and taps often don't). */
  fallbackName?: string;
}

export function classifyEssential(t: Record<string, string>): KindInfo | null {
  const a = t.amenity;
  const s = t.shop;
  if (a === "fuel") return { category: "fuel", kind: "fuel", label: "Fuel station", icon: "⛽", fallbackName: "Fuel station" };

  if (a === "restaurant") return { category: "food", kind: "restaurant", label: "Restaurant", icon: "🍽️" };
  if (a === "fast_food") return { category: "food", kind: "fast_food", label: "Fast food", icon: "🍔" };
  if (a === "cafe") return { category: "food", kind: "cafe", label: "Café", icon: "☕" };
  if (a === "pub" || a === "biergarten") return { category: "food", kind: "pub", label: "Pub (serves food)", icon: "🍺" };
  if (a === "food_court") return { category: "food", kind: "food_court", label: "Food court", icon: "🍽️" };
  if (a === "ice_cream") return { category: "food", kind: "ice_cream", label: "Ice cream", icon: "🍦" };

  if (s === "supermarket") return { category: "groceries", kind: "supermarket", label: "Supermarket", icon: "🛒" };
  if (s === "convenience" || s === "general") return { category: "groceries", kind: "convenience", label: "Small shop", icon: "🏪" };
  if (s === "bakery") return { category: "groceries", kind: "bakery", label: "Bakery", icon: "🥖" };
  if (s === "butcher") return { category: "groceries", kind: "butcher", label: "Butcher", icon: "🥩" };
  if (s === "greengrocer") return { category: "groceries", kind: "greengrocer", label: "Fruit & veg", icon: "🥕" };
  if (s === "farm") return { category: "groceries", kind: "farm", label: "Farm shop", icon: "🧑‍🌾" };
  if (s === "deli" || s === "cheese" || s === "seafood") return { category: "groceries", kind: "deli", label: "Deli", icon: "🧀" };
  if (a === "marketplace") return { category: "groceries", kind: "market", label: "Market", icon: "🧺", fallbackName: "Market" };

  if (a === "drinking_water" || a === "water_point" || (t.man_made === "water_tap" && t.drinking_water === "yes")) {
    return { category: "camp", kind: "water", label: "Drinking water", icon: "🚰", fallbackName: "Drinking water" };
  }
  if (a === "sanitary_dump_station") return { category: "camp", kind: "dump", label: "Dump station", icon: "🚽", fallbackName: "Dump station" };
  if (a === "shower") return { category: "camp", kind: "shower", label: "Showers", icon: "🚿", fallbackName: "Showers" };
  if (a === "toilets") return { category: "camp", kind: "toilets", label: "Toilets", icon: "🚻", fallbackName: "Public toilets" };
  if (t.tourism === "camp_site") return { category: "camp", kind: "campsite", label: "Campsite", icon: "⛺", fallbackName: "Campsite" };
  if (t.tourism === "caravan_site") return { category: "camp", kind: "caravan_site", label: "Motorhome site", icon: "🚐", fallbackName: "Motorhome site" };
  if (a === "parking" && /^(yes|designated)$/.test(t.motorhome ?? "")) {
    return { category: "camp", kind: "motorhome_parking", label: "Motorhome parking", icon: "🅿️", fallbackName: "Motorhome parking" };
  }
  if (s === "laundry") return { category: "camp", kind: "laundry", label: "Laundry", icon: "🧺", fallbackName: "Laundry" };
  if (s === "gas") return { category: "camp", kind: "gas_bottles", label: "Gas bottles", icon: "🔥" };

  if (a === "pharmacy") return { category: "services", kind: "pharmacy", label: "Pharmacy", icon: "💊", fallbackName: "Pharmacy" };
  if (a === "atm" || (a === "bank" && t.atm === "yes")) return { category: "services", kind: "atm", label: "ATM", icon: "🏧", fallbackName: "ATM" };
  if (a === "hospital") return { category: "services", kind: "hospital", label: t.emergency === "yes" ? "Hospital (A&E)" : "Hospital", icon: "🏥" };
  if (a === "veterinary") return { category: "services", kind: "vet", label: "Vet", icon: "🐾" };
  return null;
}

const yes = (v: string | undefined) => v === "yes" || v === "designated";

function badgesFor(info: KindInfo, t: Record<string, string>): string[] {
  const b: string[] = [];
  if (t.opening_hours === "24/7") b.push("24/7");
  if (info.kind === "fuel") {
    if (yes(t["fuel:diesel"])) b.push("Diesel");
    if (yes(t["fuel:lpg"])) b.push("LPG");
    if (yes(t["fuel:adblue"])) b.push("AdBlue");
    if (t.self_service === "yes" || t.automated === "yes") b.push("Self-service");
    if (yes(t.shop) || t.shop === "convenience") b.push("Shop");
  }
  if (info.category === "food") {
    if (t.cuisine) b.push(t.cuisine.split(";").slice(0, 2).map((c) => c.replace(/_/g, " ")).join(", "));
    if (yes(t.takeaway) || t.takeaway === "only") b.push("Takeaway");
    if (yes(t.outdoor_seating)) b.push("Outdoor seating");
    if (yes(t["diet:vegetarian"]) || t["diet:vegetarian"] === "only") b.push("Vegetarian");
  }
  if (info.category === "camp") {
    if (t.fee === "no") b.push("Free");
    if (t.fee === "yes") b.push("Fee");
    if (yes(t.motorhome) || yes(t.caravans)) b.push("Motorhomes OK");
    if (t.tents === "no") b.push("No tents");
    if (yes(t.drinking_water) && info.kind !== "water") b.push("Water");
    if (yes(t.power_supply)) b.push("Electricity");
    if (yes(t.shower)) b.push("Showers");
    if (t.water_point === "yes" && info.kind === "dump") b.push("Water");
    if (t.access === "customers") b.push("Customers only");
    if (t.seasonal && t.seasonal !== "no") b.push(`Seasonal${t.seasonal === "yes" ? "" : `: ${t.seasonal}`}`);
  }
  if (info.kind === "hospital" && t.emergency === "yes") b.push("Emergency");
  return b;
}

function addressOf(t: Record<string, string>): string | undefined {
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const parts = [street, t["addr:city"] ?? t["addr:place"]].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function isClosedForGood(t: Record<string, string>): boolean {
  return (
    t.opening_hours === "closed" ||
    t.opening_hours === "off" ||
    t.access === "private" ||
    t.access === "no" ||
    Object.keys(t).some((k) => /^(disused|abandoned|was):(amenity|shop)$/.test(k))
  );
}

export function toNearbyPlace(el: OverpassElement, center: LatLng): NearbyPlace | null {
  const t = el.tags ?? {};
  const info = classifyEssential(t);
  if (!info || isClosedForGood(t)) return null;
  const point = elementLatLng(el);
  if (!point) return null;

  const brand = t.brand ?? t.operator;
  const name = t.name ?? (info.kind === "fuel" ? brand : undefined) ?? info.fallbackName;
  // Unnamed restaurants/shops are usually mapping noise (or a building
  // outline duplicating a named node) — skip rather than show "Restaurant".
  if (!name) return null;

  const bearing = bearingDegrees(center, point);
  return {
    id: `${el.type}/${el.id}`,
    category: info.category,
    kind: info.kind,
    kindLabel: info.label,
    icon: info.icon,
    name,
    brand: t.brand && t.brand !== name ? t.brand : undefined,
    lat: point.lat,
    lng: point.lng,
    distance: Math.round(distanceMeters(center, point)),
    bearing: Math.round(bearing),
    compass: compassLabel(bearing),
    openingHours: t.opening_hours,
    badges: badgesFor(info, t),
    detail: addressOf(t),
    phone: t.phone ?? t["contact:phone"],
    website: t.website ?? t["contact:website"],
  };
}

/** Collapse the same place mapped twice (node + building outline). */
export function dedupePlaces(places: NearbyPlace[]): NearbyPlace[] {
  const out: NearbyPlace[] = [];
  for (const p of places.sort((a, b) => a.distance - b.distance)) {
    const dup = out.find(
      (o) => o.kind === p.kind && o.name.toLowerCase() === p.name.toLowerCase() && distanceMeters(o, p) < 120,
    );
    if (!dup) out.push(p);
  }
  return out;
}

export function buildNearbyQuery(center: LatLng, radii: Partial<Record<EssentialCategory, number>>): string {
  const at = `${center.lat},${center.lng}`;
  const clauses: string[] = [];
  for (const [cat, r] of Object.entries(radii) as Array<[EssentialCategory, number]>) {
    clauses.push(...CATEGORY_CONFIG[cat].clauses(`(around:${r},${at})`, r, at));
  }
  return `[out:json][timeout:25];
is_in(${at})->.here;
area.here["admin_level"="2"];
out tags;
(
${clauses.map((c) => `  ${c};`).join("\n")}
);
out tags center qt;`;
}

export interface NearbyResult {
  places: NearbyPlace[];
  radius: Partial<Record<EssentialCategory, number>>;
  country?: string;
}

export async function runNearby(center: LatLng, categories: EssentialCategory[]): Promise<NearbyResult> {
  let radii: Partial<Record<EssentialCategory, number>> = Object.fromEntries(
    categories.map((c) => [c, CATEGORY_CONFIG[c].startRadius]),
  );
  const finalRadius: Partial<Record<EssentialCategory, number>> = { ...radii };
  const byId = new Map<string, NearbyPlace>();
  let country: string | undefined;

  for (let round = 0; round < 3 && Object.keys(radii).length; round++) {
    const elements = await overpassQuery(buildNearbyQuery(center, radii), {
      timeoutMs: 20000,
      totalBudgetMs: round === 0 ? 30000 : 20000,
    });
    for (const el of elements) {
      if (el.type === "area") {
        country ??= el.tags?.["ISO3166-1"];
        continue;
      }
      const place = toNearbyPlace(el, center);
      if (place && radii[place.category] !== undefined) byId.set(place.id, place);
    }

    const counts: Partial<Record<EssentialCategory, number>> = {};
    for (const p of byId.values()) counts[p.category] = (counts[p.category] ?? 0) + 1;

    const next: Partial<Record<EssentialCategory, number>> = {};
    for (const [cat, r] of Object.entries(radii) as Array<[EssentialCategory, number]>) {
      const cfg = CATEGORY_CONFIG[cat];
      if ((counts[cat] ?? 0) < cfg.minResults && r < cfg.maxRadius) {
        next[cat] = Math.min(cfg.maxRadius, r * 3);
        finalRadius[cat] = next[cat];
      }
    }
    radii = next;
  }

  const places = dedupePlaces([...byId.values()]);
  // Cap per category: nobody scrolls past the 40th-nearest café.
  const perCat: Partial<Record<EssentialCategory, number>> = {};
  const capped = places.filter((p) => {
    perCat[p.category] = (perCat[p.category] ?? 0) + 1;
    return (perCat[p.category] ?? 0) <= 60;
  });

  return { places: capped, radius: finalRadius, country };
}
