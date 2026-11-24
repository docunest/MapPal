// Admin use case: create the reading token (or replace it). The token is returned once.
import { newToken, tokenHash } from "../domain/device";
import { replaceToken } from "../infrastructure/repo";

export async function rotateToken(): Promise<{ token: string }> {
  const token = newToken();
  await replaceToken(tokenHash(token));
  return { token };
}
