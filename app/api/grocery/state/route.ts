import { api, getState } from "@/domains/grocery";

// Polled by every open phone (2 s in the store, 5 s otherwise); cheap when unchanged.
export const GET = api(async ({ req }) => getState(new URL(req.url).searchParams.get("v")));
