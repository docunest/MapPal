import { api, body, listMembers, rememberMember } from "@/domains/grocery";

export const GET = api(async () => ({ members: await listMembers() }));
export const POST = api(async ({ req }) => ({ members: await rememberMember((await body<{ name?: string }>(req)).name) }));
