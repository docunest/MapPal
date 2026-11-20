import { AiUnavailable, api, suggestWithAi } from "@/domains/grocery";

export const POST = api(async () => {
  try {
    return await suggestWithAi();
  } catch (err) {
    if (err instanceof AiUnavailable) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
});
