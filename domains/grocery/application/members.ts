import { ensureReady } from "../infrastructure/seed";
import { listMembers as list, touchMember } from "../infrastructure/repo";

export async function listMembers() {
  await ensureReady();
  return list();
}

/** A name is the account (hard rules §5): remember it, return everyone. */
export async function rememberMember(name: string | null | undefined) {
  await ensureReady();
  const n = name?.trim().slice(0, 40);
  if (n) await touchMember(n);
  return list();
}
