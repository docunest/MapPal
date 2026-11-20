import { api, body, BadRequest } from "@/lib/grocery/http";
import { setCategoryOrder } from "@/lib/grocery/store";

export const PUT = api(async ({ req }) => {
  const b = await body<{ ids?: string[] }>(req);
  if (!Array.isArray(b.ids)) throw new BadRequest("ids[] required");
  await setCategoryOrder(b.ids);
  return { ok: true };
});
