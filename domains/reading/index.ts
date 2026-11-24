// The ONLY public surface of the reading domain (docunest hard rules §3).
// Route files in app/reading and app/api/reading import from here and nothing deeper.
export { api, jsonBody, preflight, BadRequest } from "./infrastructure/http";
export { health } from "./application/health";
export { recordAttempts } from "./application/recordAttempts";
export { getSummary } from "./application/summary";
export { ReadingSummary } from "./ui/ReadingSummary";
