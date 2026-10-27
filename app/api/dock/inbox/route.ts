import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { normalizeInbox, safeHeaders, safeQuery } from "@/lib/dock/inbox";
import { dockItemJson } from "@/lib/dock/items";
import { resolveShared } from "@/lib/dock/resolve";

// /api/dock/inbox — the phone's share button. Send any time (the car can be
// off): the link waits here until the head unit polls for it.
//
// Simplest (iPhone Shortcuts "Get Contents of URL", default GET):
//   GET  /api/dock/inbox?token=…&text=<Shortcut Input>
// Or POST with JSON, form or plain text — shortcuts differ in what they send:
//   {"text": "Camping Playa Joyel\nhttps://maps.app…"}   whatever the share sheet gave
//   {"url": "https://maps.app.goo.gl/…"}                 a map link
//   {"lat": 43.48, "lng": -3.52, "title": "Parking"}     raw coordinates
//   optional: "title", "note", "from" (e.g. "Lukas iPhone")
// Field names are matched leniently (lib/dock/inbox.ts). Every request is
// logged without secrets (GET /api/dock/inbox/log, and on /dock).
const fieldsSchema = z
  .object({
    url: z.string().max(4000).optional(),
    text: z.string().max(4000).optional(),
    title: z.string().max(300).optional(),
    note: z.string().max(2000).optional(),
    from: z.string().max(100).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((b) => b.url || b.text || (b.lat !== undefined && b.lng !== undefined), "Nothing to send: no link, text or lat+lng found");

const KEEP_LOGS = 100;

/** Raw body as received (for the log) + its parsed form. */
async function readBody(req: Request): Promise<{ raw: string | null; parsed: unknown }> {
  if (req.method === "GET") {
    return { raw: null, parsed: Object.fromEntries([...new URL(req.url).searchParams].filter(([k]) => k !== "token")) };
  }
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const entries = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `(file ${v.name})`])) : {};
    return { raw: JSON.stringify(entries), parsed: entries };
  }
  const raw = await req.text().catch(() => "");
  let parsed: unknown = raw;
  if (type.includes("x-www-form-urlencoded")) parsed = Object.fromEntries(new URLSearchParams(raw));
  else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  // Query parameters count too (e.g. POST …?text=… with an empty body).
  const query = Object.fromEntries([...new URL(req.url).searchParams].filter(([k]) => k !== "token"));
  if (Object.keys(query).length && (parsed === "" || parsed == null)) parsed = query;
  return { raw, parsed };
}

async function log(req: Request, raw: string | null, status: number, outcome: string, itemId?: string) {
  try {
    await prisma.dockInboxLog.create({
      data: {
        method: req.method,
        contentType: req.headers.get("content-type"),
        query: safeQuery(req.url),
        headers: safeHeaders(req.headers),
        body: raw?.slice(0, 8000) ?? null,
        status,
        outcome: outcome.slice(0, 500),
        itemId,
      },
    });
    const old = await prisma.dockInboxLog.findMany({ orderBy: { createdAt: "desc" }, skip: KEEP_LOGS, select: { id: true } });
    if (old.length) await prisma.dockInboxLog.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  } catch (err) {
    console.error("[dock inbox log]", err);
  }
}

async function handle(req: Request) {
  const { raw, parsed } = await readBody(req);
  const caller = await dockCaller(req);
  if (!caller) {
    await log(req, raw, 401, "401 wrong or missing token");
    return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  }

  const fields = fieldsSchema.safeParse(normalizeInbox(parsed));
  if (!fields.success) {
    const msg = fields.error.issues.map((i) => i.message).join("; ");
    await log(req, raw, 400, `400 ${msg}`);
    return NextResponse.json({ error: msg, received: parsed }, { status: 400 });
  }
  const b = fields.data;

  const resolved =
    b.lat !== undefined && b.lng !== undefined && !b.url && !b.text
      ? { title: b.title ?? `${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}`, point: { lat: b.lat, lng: b.lng }, locatedBy: "link" as const }
      : await resolveShared({ url: b.url, text: b.text, title: b.title });

  try {
    const item = await prisma.dockItem.create({
      data: {
        kind: "link",
        title: resolved.title,
        sourceUrl: "sourceUrl" in resolved ? resolved.sourceUrl : undefined,
        resolvedUrl: "resolvedUrl" in resolved ? resolved.resolvedUrl : undefined,
        lat: resolved.point?.lat,
        lng: resolved.point?.lng,
        locatedBy: resolved.locatedBy,
        address: "address" in resolved ? resolved.address : undefined,
        note: b.note,
        sentBy: b.from ?? (caller === "token" ? undefined : caller),
      },
    });
    await log(req, raw, 201, `created "${item.title}" (${item.locatedBy}${item.lat != null ? ` ${item.lat.toFixed(4)},${item.lng?.toFixed(4)}` : ""})`, item.id);
    return NextResponse.json({ ok: true, item: dockItemJson(item) }, { status: 201 });
  } catch (err) {
    const msg = describeDbError(err);
    await log(req, raw, 500, `500 ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
