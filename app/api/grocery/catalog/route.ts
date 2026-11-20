import { api } from "@/lib/grocery/http";
import { loadCatalog } from "@/lib/grocery/store";

export const GET = api(async () => loadCatalog());
