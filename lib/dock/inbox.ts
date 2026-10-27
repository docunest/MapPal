// What a phone's share shortcut sent → the fields the inbox understands.
// Lenient on purpose: iPhone Shortcuts and Android share apps name things
// differently ("Shortcut Input", "URL", arrays…), and debugging them on the
// phone is painful. Known names first; otherwise every string value in the
// payload is searched for a link.
import type { DockInboxLog } from "@prisma/client";

export interface InboxFields {
  url?: string;
  text?: string;
  title?: string;
  note?: string;
  from?: string;
  lat?: number;
  lng?: number;
}

const ALIASES: Record<keyof InboxFields, string[]> = {
  url: ["url", "link", "href", "uri"],
  text: ["text", "input", "shortcutinput", "shortcut_input", "shared", "sharedtext", "body", "content", "message", "q"],
  title: ["title", "name", "label"],
  note: ["note", "notes", "comment"],
  from: ["from", "sender", "device", "who"],
  lat: ["lat", "latitude"],
  lng: ["lng", "lon", "long", "longitude"],
};

const norm = (k: string) => k.toLowerCase().replace(/[\s-]/g, "");

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

function first(v: unknown): string | undefined {
  const s = strings(v).map((x) => x.trim()).filter(Boolean);
  return s.length ? s.join("\n") : undefined;
}

export function normalizeInbox(raw: unknown): InboxFields {
  if (raw == null) return {};
  if (typeof raw === "string" || Array.isArray(raw)) return { text: first(raw) };
  if (typeof raw !== "object") return { text: String(raw) };
  const obj = raw as Record<string, unknown>;
  const byKey = new Map(Object.entries(obj).map(([k, v]) => [norm(k), v]));
  const out: InboxFields = {};
  for (const [field, names] of Object.entries(ALIASES) as Array<[keyof InboxFields, string[]]>) {
    const hit = names.map((n) => byKey.get(n)).find((v) => v !== undefined && v !== null && v !== "");
    if (hit === undefined) continue;
    if (field === "lat" || field === "lng") {
      const n = Number(first(hit));
      if (Number.isFinite(n)) out[field] = n;
    } else {
      out[field] = first(hit);
    }
  }
  // Nothing under a known name: use every string value (a link in there somewhere).
  if (!out.url && !out.text && (out.lat === undefined || out.lng === undefined)) {
    const all = first(obj);
    if (all) out.text = all;
  }
  return out;
}

const SECRET_HEADERS = new Set(["authorization", "cookie", "x-dock-token", "x-admin-secret", "proxy-authorization"]);

/** Headers worth seeing when debugging a shortcut — never secrets, never Vercel noise. */
export function safeHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (SECRET_HEADERS.has(k) || k.startsWith("x-vercel") || k.startsWith("x-forwarded") || k === "forwarded") return;
    out[k] = value.slice(0, 300);
  });
  if (h.get("authorization")) out.authorization = "(present, hidden)";
  if (h.get("x-dock-token")) out["x-dock-token"] = "(present, hidden)";
  return out;
}

/** Query string with the token taken out. */
export function safeQuery(url: string): string {
  const u = new URL(url);
  if (u.searchParams.has("token")) u.searchParams.set("token", "(hidden)");
  return u.search;
}

export function inboxLogJson(l: DockInboxLog) {
  return {
    id: l.id,
    at: l.createdAt.toISOString(),
    method: l.method,
    contentType: l.contentType,
    query: l.query,
    headers: l.headers,
    body: l.body,
    status: l.status,
    outcome: l.outcome,
    itemId: l.itemId,
  };
}
