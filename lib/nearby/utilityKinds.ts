// What counts as a utility, per the owner: fuel, restaurants, groceries —
// nothing else for now. Shared by every source that lists utilities (OSM via
// Overpass, OSM via Photon), so classification is identical whichever answered.
import type { UtilityCategory } from "../sources/types";

type Tags = Record<string, string>;

export interface UtilityKind {
  category: UtilityCategory;
  kind: string;
  label: string;
  icon: string;
  /** Used when the element has no name (fuel stations often don't). */
  fallbackName?: string;
}

/** OSM key=value pairs per category — used for Overpass clauses and Photon osm_tag filters. */
export const UTILITY_TAGS: Record<UtilityCategory, Array<[string, string]>> = {
  fuel: [["amenity", "fuel"]],
  restaurants: [
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
    ["amenity", "cafe"],
    ["amenity", "food_court"],
  ],
  groceries: [
    ["shop", "supermarket"],
    ["shop", "convenience"],
    ["shop", "greengrocer"],
    ["shop", "bakery"],
    ["shop", "butcher"],
    ["shop", "farm"],
    ["shop", "deli"],
    ["shop", "seafood"],
    // Mercados municipais / de abastos — the best groceries in Iberia.
    ["amenity", "marketplace"],
  ],
};

export function classifyUtility(t: Tags): UtilityKind | null {
  const a = t.amenity;
  const s = t.shop;
  if (a === "fuel") return { category: "fuel", kind: "fuel", label: "Fuel station", icon: "⛽", fallbackName: "Fuel station" };

  if (a === "restaurant") return { category: "restaurants", kind: "restaurant", label: "Restaurant", icon: "🍽️" };
  if (a === "fast_food") return { category: "restaurants", kind: "fast_food", label: "Fast food", icon: "🍔" };
  if (a === "cafe") return { category: "restaurants", kind: "cafe", label: "Café", icon: "☕" };
  if (a === "food_court") return { category: "restaurants", kind: "food_court", label: "Food court", icon: "🍽️" };

  if (s === "supermarket") return { category: "groceries", kind: "supermarket", label: "Supermarket", icon: "🛒" };
  if (s === "convenience") return { category: "groceries", kind: "convenience", label: "Small shop", icon: "🏪" };
  if (s === "bakery") return { category: "groceries", kind: "bakery", label: "Bakery", icon: "🥖" };
  if (s === "butcher") return { category: "groceries", kind: "butcher", label: "Butcher", icon: "🥩" };
  if (s === "greengrocer") return { category: "groceries", kind: "greengrocer", label: "Fruit & veg", icon: "🥕" };
  if (s === "farm") return { category: "groceries", kind: "farm", label: "Farm shop", icon: "🧑‍🌾" };
  if (s === "deli" || s === "seafood") return { category: "groceries", kind: "deli", label: s === "seafood" ? "Fishmonger" : "Deli", icon: s === "seafood" ? "🐟" : "🧀" };
  if (a === "marketplace") return { category: "groceries", kind: "market", label: "Market", icon: "🧺", fallbackName: "Market" };
  return null;
}

/** Same classification from Photon's single osm_key/osm_value pair. */
export function classifyPhoton(osmKey: string | undefined, osmValue: string | undefined): UtilityKind | null {
  return osmKey && osmValue ? classifyUtility({ [osmKey]: osmValue }) : null;
}

const yes = (v: string | undefined) => v === "yes" || v === "designated";

export function utilityBadges(kind: UtilityKind, t: Tags): string[] {
  const b: string[] = [];
  if (t.opening_hours === "24/7") b.push("24/7");
  if (kind.category === "fuel") {
    if (yes(t["fuel:diesel"])) b.push("Diesel");
    if (yes(t["fuel:lpg"])) b.push("LPG");
    if (yes(t["fuel:adblue"])) b.push("AdBlue");
    if (yes(t["fuel:HGV_diesel"])) b.push("HGV diesel");
    if (t.self_service === "yes" || t.automated === "yes") b.push("Self-service");
    if (yes(t.compressed_air)) b.push("Air");
    if (yes(t.car_wash)) b.push("Car wash");
  }
  if (kind.category === "restaurants") {
    if (t.cuisine) b.push(t.cuisine.split(";").slice(0, 2).map((c) => c.replace(/_/g, " ")).join(", "));
    if (yes(t.takeaway) || t.takeaway === "only") b.push("Takeaway");
    if (yes(t.outdoor_seating)) b.push("Terrace");
    if (yes(t["diet:vegetarian"]) || t["diet:vegetarian"] === "only") b.push("Vegetarian");
  }
  if (kind.category === "groceries" && t.organic && t.organic !== "no") b.push("Organic");
  return b;
}

export function addressFromTags(t: Tags): string | undefined {
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const parts = [street, t["addr:city"] ?? t["addr:place"]].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Closed for good, private, or a mapping leftover — never show. */
export function isGone(t: Tags): boolean {
  return (
    t.opening_hours === "closed" ||
    t.opening_hours === "off" ||
    t.access === "private" ||
    t.access === "no" ||
    Object.keys(t).some((k) => /^(disused|abandoned|was|demolished|removed):(amenity|shop)$/.test(k))
  );
}
