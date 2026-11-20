import { after } from "next/server";
import { addItems, api, BadRequest, body, classifyNew, type AddRequest } from "@/domains/grocery";

export const POST = api(async ({ req, member }) => {
  const b = await body<{ items?: AddRequest[]; via?: string }>(req);
  if (!Array.isArray(b.items) || !b.items.length) throw new BadRequest("items[] required");
  const { results, removed, toClassify } = await addItems(b.items, member, b.via ?? "typed");
  // New items typed by hand land in "Kita"; DeepSeek files them after the reply.
  if (toClassify.length) after(() => classifyNew(toClassify));
  return { results, removed };
});
