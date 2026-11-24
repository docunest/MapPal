// Private admin use cases: issue, list and revoke device tokens without any database access.
import { newToken, tokenHash, validDeviceName } from "../domain/device";
import { createDevice, listDevices, revokeDevice } from "../infrastructure/repo";
import { BadRequest } from "../infrastructure/http";

/** The token is returned once; only its SHA-256 is stored. */
export async function issueDevice(raw: unknown): Promise<{ name: string; token: string }> {
  const name = validDeviceName(typeof (raw as { name?: unknown })?.name === "string" ? (raw as { name: string }).name : "");
  if (!name) throw new BadRequest("name: 1 to 40 letters, digits, spaces, . _ -");
  const token = newToken();
  await createDevice(name, tokenHash(token));
  return { name, token };
}

export async function devicesList() {
  return { devices: await listDevices() };
}

export async function revokeByName(raw: unknown): Promise<{ revoked: number }> {
  const name = validDeviceName(typeof (raw as { name?: unknown })?.name === "string" ? (raw as { name: string }).name : "");
  if (!name) throw new BadRequest("name is required");
  return { revoked: await revokeDevice(name) };
}
