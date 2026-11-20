"use client";
// Browser-side API access: token + member name on every call.

export const LS = {
  token: "grocery.token",
  member: "grocery.member",
  lang: "grocery.lang",
  catalog: "grocery.catalog",
  state: "grocery.state",
  outbox: "grocery.outbox",
  hideBought: "grocery.hideBought",
};

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = lsGet(LS.token) ?? "";
  const member = lsGet(LS.member) ?? "";
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-member": encodeURIComponent(member),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status, json.error ?? res.statusText);
  return json;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
