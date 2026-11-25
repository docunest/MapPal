import { api, content, preflight } from "@/domains/reading";

export const maxDuration = 60;

// Open (trusted devices): what the games show. ?v=<version> → {unchanged: true} when nothing is new.
export const GET = api(async (req) => content(new URL(req.url).searchParams, new URL(req.url).origin));
export const OPTIONS = async () => preflight();
