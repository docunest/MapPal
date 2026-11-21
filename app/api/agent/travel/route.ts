import { NextResponse } from "next/server";
import { getTravelState } from "@/lib/agent";

// The location estimate with every hint (family login), for the debug map.
export async function GET() {
  const s = await getTravelState();
  return NextResponse.json(
    {
      why: s.why,
      estimate: s.estimate,
      hints: s.hints.slice(0, 300).map((h) => ({ label: h.label, source: h.source, lat: h.lat, lng: h.lng, at: h.at, ageH: Math.round(h.ageH * 10) / 10, weight: Math.round(h.weight * 100) / 100, used: h.used, note: h.note })),
      destinations: s.destinations.slice(0, 30),
      target: s.target,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
