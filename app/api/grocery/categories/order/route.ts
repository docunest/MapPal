import { api, BadRequest, body, setAisleOrder } from "@/domains/grocery";

export const PUT = api(async ({ req }) => {
  const b = await body<{ ids?: string[] }>(req);
  if (!Array.isArray(b.ids)) throw new BadRequest("ids[] required");
  await setAisleOrder(b.ids);
  return { ok: true };
});
