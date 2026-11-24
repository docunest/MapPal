import { api, jsonBody, preflight, recordAttempts } from "@/domains/reading";

// Written by the Ponas game (games/skaitymas). OPTIONS: the game calls from its own origin (CORS).
export const POST = api(async (req) => recordAttempts(await jsonBody(req)));
export const OPTIONS = async () => preflight();
