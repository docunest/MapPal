// Google Places (New): the paid, capped secondary source.
//   • utilities — Nearby Search Pro, only to fill categories the free
//     sources left short (orchestrator decides), max 20 results per call.
//   • details   — on a tap: find the Google place (Text Search, IDs only —
//     free) then one Place Details call for rating, reviews, current hours
//     and fuel prices (billed as Enterprise + Atmosphere). For sights only
//     when there's no Wikipedia article.
// Every call goes through the usage guard first; defaults keep the month
// inside Google's free allowance (lib/sources/usage.ts). Content is shown,
// never stored (Google's terms); field masks request only what's shown.
import { distanceMeters } from "../geo";
import type { DetailBlock, PlaceRef, Source, SourceContext, UtilityCategory, UtilityPlace } from "./types";
import { SourceCappedError } from "./types";

const BASE = "https://places.googleapis.com/v1";

const TYPES: Record<UtilityCategory, string[]> = {
  fuel: ["gas_station"],
  restaurants: ["restaurant", "cafe", "fast_food_restaurant"],
  groceries: ["supermarket", "grocery_store", "convenience_store", "bakery", "butcher_shop", "market"],
};

const KIND: Record<UtilityCategory, { kind: string; label: string; icon: string }> = {
  fuel: { kind: "fuel", label: "Fuel station", icon: "⛽" },
  restaurants: { kind: "restaurant", label: "Restaurant", icon: "🍽️" },
  groceries: { kind: "supermarket", label: "Shop", icon: "🛒" },
};

async function call<T>(path: string, init: RequestInit & { fieldMask: string }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY ?? "",
      "X-Goog-FieldMask": init.fieldMask,
    },
    signal: AbortSignal.timeout(10000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  // A console quota hit (the hard cap) comes back as 429 RESOURCE_EXHAUSTED.
  if (res.status === 429) throw new SourceCappedError(`Google quota reached: ${json.error?.message ?? ""}`);
  if (!res.ok) throw new Error(`Google ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

async function guard(ctx: SourceContext, sku: string) {
  if (!(await ctx.usage.take("google", sku))) throw new SourceCappedError(`Google ${sku} limit for today/this month reached`);
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  reviews?: Array<{
    rating?: number;
    text?: { text: string };
    originalText?: { text: string };
    authorAttribution?: { displayName?: string };
    relativePublishTimeDescription?: string;
  }>;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  fuelOptions?: { fuelPrices?: Array<{ type: string; price?: { currencyCode: string; units?: string; nanos?: number }; updateTime?: string }> };
}

const PRICE_LEVEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

const FUEL_NAMES: Record<string, string> = {
  DIESEL: "Diesel",
  PREMIUM_DIESEL: "Premium diesel",
  REGULAR_UNLEADED: "Unleaded 95",
  MIDGRADE: "Midgrade",
  PREMIUM: "Premium",
  SP91: "SP91",
  SP91_E10: "SP91 E10",
  SP92: "SP92",
  SP95: "Unleaded 95",
  SP95_E10: "Unleaded 95 E10",
  SP98: "Unleaded 98",
  SP99: "SP99",
  SP100: "SP100",
  LPG: "LPG (autogas)",
  E80: "E80",
  E85: "E85",
  METHANE: "CNG",
  BIO_DIESEL: "Biodiesel",
  TRUCK_DIESEL: "Truck diesel",
};

export function placeToUtility(p: GooglePlace, category: UtilityCategory): UtilityPlace | null {
  if (!p.location || !p.displayName?.text || p.businessStatus === "CLOSED_PERMANENTLY") return null;
  const k = KIND[category];
  return {
    key: `google:${p.id}`,
    category,
    kind: k.kind,
    kindLabel: k.label,
    icon: k.icon,
    name: p.displayName.text,
    lat: p.location.latitude,
    lng: p.location.longitude,
    badges: p.businessStatus === "CLOSED_TEMPORARILY" ? ["Temporarily closed"] : [],
    address: p.formattedAddress,
    sources: [{ source: "google", url: p.googleMapsUri }],
    refs: { google: p.id },
  };
}

/** Details response → blocks. Pure; tested on a recorded-shape fixture. */
export function detailBlocks(p: GooglePlace): DetailBlock[] {
  const blocks: DetailBlock[] = [];
  const url = p.googleMapsUri;
  if (p.rating !== undefined || p.reviews?.length) {
    blocks.push({
      id: "google:rating",
      source: "google",
      title: "Google rating & reviews",
      url,
      section: {
        kind: "rating",
        rating: p.rating,
        count: p.userRatingCount,
        priceLevel: p.priceLevel ? PRICE_LEVEL[p.priceLevel] : undefined,
        reviews: (p.reviews ?? []).slice(0, 3).map((r) => ({
          author: r.authorAttribution?.displayName,
          rating: r.rating,
          text: (r.text?.text ?? r.originalText?.text ?? "").slice(0, 600),
          when: r.relativePublishTimeDescription,
        })).filter((r) => r.text),
      },
    });
  }
  const hours = p.currentOpeningHours?.weekdayDescriptions ?? p.regularOpeningHours?.weekdayDescriptions;
  if (hours?.length) {
    blocks.push({ id: "google:hours", source: "google", title: "Opening hours (Google)", url, section: { kind: "hours", lines: hours, openNow: p.currentOpeningHours?.openNow } });
  }
  const prices = p.fuelOptions?.fuelPrices?.filter((f) => f.price);
  if (prices?.length) {
    blocks.push({
      id: "google:fuel",
      source: "google",
      title: "Fuel prices (Google)",
      url,
      section: {
        kind: "fuel-prices",
        prices: prices.map((f) => {
          const amount = Number(f.price!.units ?? 0) + (f.price!.nanos ?? 0) / 1e9;
          return {
            type: FUEL_NAMES[f.type] ?? f.type,
            price: `${amount.toFixed(3)} ${f.price!.currencyCode === "EUR" ? "€" : f.price!.currencyCode}`,
            updated: f.updateTime ? new Date(f.updateTime).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : undefined,
          };
        }),
      },
    });
  }
  return blocks;
}

async function findPlaceId(place: PlaceRef, ctx: SourceContext): Promise<string | undefined> {
  if (place.refs.google) return place.refs.google;
  await guard(ctx, "text-search-ids");
  const res = await call<{ places?: Array<{ id: string }> }>("/places:searchText", {
    method: "POST",
    fieldMask: "places.id",
    body: JSON.stringify({
      textQuery: place.name,
      pageSize: 1,
      locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 300 } },
      languageCode: place.userLang,
    }),
  });
  return res.places?.[0]?.id;
}

export const googleSource: Source = {
  meta: {
    id: "google",
    label: "Google Maps",
    type: "reviews",
    cost: "paid",
    ai: false,
    homepage: "https://maps.google.com",
    requiresEnv: ["GOOGLE_MAPS_API_KEY"],
    description: "Ratings, reviews, current opening hours and fuel prices on tap; fills gaps in the lists. Capped inside Google's free monthly allowance.",
    priority: 90,
    nearestFirst: true,
  },
  configured: () => !!process.env.GOOGLE_MAPS_API_KEY,
  async utilities(q, ctx) {
    const out: UtilityPlace[] = [];
    for (const [cat, radius] of Object.entries(q.radius) as Array<[UtilityCategory, number]>) {
      await guard(ctx, "nearby-search-pro");
      const res = await call<{ places?: GooglePlace[] }>("/places:searchNearby", {
        method: "POST",
        // Pro-tier fields only — no rating/hours here, those are billed higher.
        fieldMask: "places.id,places.displayName,places.location,places.formattedAddress,places.businessStatus,places.googleMapsUri",
        body: JSON.stringify({
          includedTypes: TYPES[cat],
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: { circle: { center: { latitude: q.center.lat, longitude: q.center.lng }, radius: Math.min(50000, radius) } },
        }),
      });
      for (const p of res.places ?? []) {
        const u = placeToUtility(p, cat);
        if (u) out.push(u);
      }
    }
    return out;
  },
  async details(place, ctx) {
    // Sights: Google only as a fallback when no Wikipedia article exists.
    if (place.mode === "sight" && place.wiki.length) return [];
    const id = await findPlaceId(place, ctx);
    if (!id) return [];
    await guard(ctx, "place-details-atmosphere");
    const p = await call<GooglePlace>(`/places/${encodeURIComponent(id)}?languageCode=${encodeURIComponent(place.userLang)}`, {
      method: "GET",
      fieldMask: "id,location,googleMapsUri,rating,userRatingCount,priceLevel,reviews,currentOpeningHours,regularOpeningHours,fuelOptions",
    });
    // Name search can land on another branch of a chain — don't show its reviews.
    if (p.location && distanceMeters(place, { lat: p.location.latitude, lng: p.location.longitude }) > 300) return [];
    return detailBlocks(p);
  },
};
