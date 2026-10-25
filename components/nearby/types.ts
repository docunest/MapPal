import type { NearbyUtility } from "@/lib/nearby/utilities";
import type { Sight } from "@/lib/nearby/sights";
import type { DetailBlock, SourceNote, UtilityCategory } from "@/lib/sources/types";

export type { NearbyUtility, Sight, DetailBlock, SourceNote, UtilityCategory };

export interface UtilitiesResponse {
  places: NearbyUtility[];
  radius: Partial<Record<UtilityCategory, number>>;
  notes: SourceNote[];
  country?: string;
  region?: string;
}

export interface SightsResponse {
  sights: Sight[];
  notes: SourceNote[];
  radius: number;
  localLangs: string[];
  country?: string;
}

export interface DetailsResponse {
  blocks: DetailBlock[];
  notes: SourceNote[];
}

export type Selected =
  | { mode: "utility"; item: NearbyUtility; country?: string; localLangs: string[] }
  | { mode: "sight"; item: Sight; localLangs: string[] };

export const userLang = () =>
  typeof navigator === "undefined" ? "en" : (navigator.language || "en").toLowerCase().split("-")[0];

export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const wazeUrl = (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
