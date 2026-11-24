import { adminApi, jsonBody, revokeByName } from "@/domains/reading";

// POST {"name":"phone"} → revokes every active device with that name.
export const POST = adminApi(async (req) => revokeByName(await jsonBody(req)));
