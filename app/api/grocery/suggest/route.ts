import { api, suggestFromHistory } from "@/domains/grocery";

export const GET = api(async () => suggestFromHistory());
