import { aiStatus, api } from "@/domains/grocery";

// DeepSeek balance + this app's AI usage vs its caps (family token; no secrets).
export const GET = api(async () => aiStatus());
