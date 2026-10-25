import { NextResponse } from "next/server";
import { isValidLatLng, type LatLng } from "./geo";

export function numParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function latLngParam(params: URLSearchParams, latKey = "lat", lngKey = "lng"): LatLng | undefined {
  const lat = numParam(params, latKey);
  const lng = numParam(params, lngKey);
  return isValidLatLng(lat, lng) ? { lat: lat!, lng: lng! } : undefined;
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Upstream (Overpass/Wikimedia/OSRM) failures. Next.js strips error details
 * from uncaught throws in production, so always answer with the message.
 */
export function upstreamError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: `Map data service failed: ${message.slice(0, 300)}` }, { status: 502 });
}
