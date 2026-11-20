import { api, BadRequest, body, parseText } from "@/domains/grocery";

export const POST = api(async ({ req }) => {
  const b = await body<{ text?: string; ai?: boolean }>(req);
  if (!b.text?.trim()) throw new BadRequest("text required");
  return parseText(b.text.trim(), { ai: b.ai });
});
