// "Open now?" — evaluated on the device, because the device is in the
// traveller's local time zone (the server isn't). The opening_hours library
// is ~1 MB with holiday data, so it's loaded only when first needed.
import type OpeningHours from "opening_hours";

export interface HoursState {
  state: "open" | "closed" | "unknown";
  label: string;
}

let lib: Promise<typeof OpeningHours> | null = null;
export function loadOpeningHours(): Promise<typeof OpeningHours> {
  lib ??= import("opening_hours").then((m) => m.default);
  return lib;
}

function when(d: Date, now: Date): string {
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  if (sameDay) return time;
  if (tomorrow) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

export function evaluateHours(
  OH: typeof OpeningHours,
  value: string | undefined,
  at: { lat: number; lng: number; country?: string },
  now = new Date(),
): HoursState {
  if (!value) return { state: "unknown", label: "Hours unknown" };
  if (value.trim() === "24/7") return { state: "open", label: "Open 24/7" };
  try {
    const oh = new OH(value, {
      lat: at.lat,
      lon: at.lng,
      address: { country_code: (at.country ?? "es").toLowerCase(), state: "" },
    });
    const state = oh.getStateString(now, false);
    const next = oh.getNextChange(now, new Date(now.getTime() + 7 * 86400000));
    if (state === "open") return { state: "open", label: next ? `Open · closes ${when(next, now)}` : "Open" };
    if (state === "close") return { state: "closed", label: next ? `Closed · opens ${when(next, now)}` : "Closed" };
    return { state: "unknown", label: oh.getComment(now) ?? "Hours unclear" };
  } catch {
    // Unparseable hours — show the raw text in details, don't guess here.
    return { state: "unknown", label: "Hours unclear" };
  }
}
