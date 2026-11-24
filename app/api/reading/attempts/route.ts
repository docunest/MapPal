import { api, jsonBody, recordAttempts } from "@/domains/reading";

// Written by the Ponas game (games/skaitymas) and by the parent app.
export const POST = api(async (req) => recordAttempts(await jsonBody(req)));
