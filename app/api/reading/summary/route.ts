import { api, getSummary } from "@/domains/reading";

export const GET = api(async (req) => getSummary(new URL(req.url).searchParams));
