import { api, getCatalog } from "@/domains/grocery";

export const GET = api(async () => getCatalog());
