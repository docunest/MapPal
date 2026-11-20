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
  noteServerVersion(res.headers.get("x-app-version"));
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status, json.error ?? res.statusText);
  return json;
}

/** The build baked into this page (<meta name="app-version">). */
export function pageVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[name="app-version"]')?.getAttribute("content") ?? null;
}

/**
 * A reply came from a newer deployment: announce it once. The app reloads when
 * nothing would be lost (ui/App.tsx). Guard: never reload twice for the same
 * server version, so a mismatch that a reload can't fix doesn't loop.
 */
let announced: string | null = null;
function noteServerVersion(server: string | null) {
  const mine = pageVersion();
  if (!server || !mine || server === mine || announced === server) return;
  try {
    if (sessionStorage.getItem("grocery.reloadedFor") === server) return;
  } catch {
    /* private mode */
  }
  announced = server;
  window.dispatchEvent(new CustomEvent("grocery:update", { detail: server }));
}

export function markReloadFor(server: string) {
  try {
    sessionStorage.setItem("grocery.reloadedFor", server);
  } catch {
    /* private mode */
  }
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
