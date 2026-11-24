import { adminApi, rotateToken } from "@/domains/reading";

// POST → the reading token, shown once. Calling it again replaces the token; the old one stops working at once.
export const POST = adminApi(async () => rotateToken());
