import { NextResponse } from "next/server";
import { baseUrlOf, manualPayload, manualPreview, RunError } from "@/lib/agent";

// Manual run (family login): POST {lat, lng, label?, use_cases?, page_size?, by, preview?}
// → preview text (free), or the full payload to paste into any chat agent.
export const maxDuration = 120;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { lat?: unknown; lng?: unknown; label?: unknown; use_cases?: unknown; page_size?: unknown; by?: unknown; preview?: unknown };
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  const args = {
    lat,
    lng,
    label: typeof b.label === "string" ? b.label : undefined,
    use_cases: Array.isArray(b.use_cases) ? b.use_cases.filter((x): x is string => typeof x === "string") : undefined,
    page_size: typeof b.page_size === "number" ? b.page_size : undefined,
  };
  try {
    if (b.preview === true) return NextResponse.json(await manualPreview(args));
    return NextResponse.json(await manualPayload(args, typeof b.by === "string" ? b.by : "app", baseUrlOf(req)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof RunError ? 400 : 500 });
  }
}
