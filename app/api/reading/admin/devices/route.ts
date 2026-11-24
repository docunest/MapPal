import { adminApi, devicesList, issueDevice, jsonBody } from "@/domains/reading";

// POST {"name":"phone"} → {name, token}. The token is shown once. GET → device list.
export const POST = adminApi(async (req) => issueDevice(await jsonBody(req)));
export const GET = adminApi(async () => devicesList());
