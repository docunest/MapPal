// Moved to lib/openingHours.ts so the scenario tiers (lib/scenarios/tiers.ts)
// can share it; kept here so existing imports keep working.
export { evaluateHours, loadOpeningHours, type HoursState } from "@/lib/openingHours";
