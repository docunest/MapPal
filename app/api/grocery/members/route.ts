import { api, body } from "@/lib/grocery/http";
import { listMembers, touchMember } from "@/lib/grocery/store";
import { ensureReady } from "@/lib/grocery/seed";

export const GET = api(async () => {
  await ensureReady();
  return { members: await listMembers() };
});

export const POST = api(async ({ req }) => {
  await ensureReady();
  const b = await body<{ name?: string }>(req);
  const name = b.name?.trim().slice(0, 40);
  if (name) await touchMember(name);
  return { members: await listMembers() };
});
