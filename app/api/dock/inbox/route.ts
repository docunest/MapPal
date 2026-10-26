import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { dockItemJson } from "@/lib/dock/items";
import { resolveShared } from "@/lib/dock/resolve";

// POST /api/dock/inbox — the phone's share button. Send any time (the car
// can be off): the link waits here until the head unit polls for it.
//
// Body (JSON, form or plain text — share shortcuts differ in what they can send):
//   {"url": "https://maps.app.goo.gl/…"}                 a map link
//   {"text": "Camping Playa Joyel\nhttps://maps.app…"}   whatever the share sheet gave
//   {"lat": 43.48, "lng": -3.52, "title": "Parking"}     raw coordinates
//   optional: "title", "note", "from" (e.g. "Lukas iPhone")
const bodySchema = z
  .object({
    url: z.string().max(4000).optional(),
    text: z.string().max(4000).optional(),
    title: z.string().max(300).optional(),
    note: z.string().max(2000).optional(),
    from: z.string().max(100).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((b) => b.url || b.text || (b.lat !== undefined && b.lng !== undefined), "Send url, text, or lat+lng");

async function readBody(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return req.json().catch(() => null);
  if (type.includes("form")) return Object.fromEntries((await req.formData()).entries());
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export async function POST(req: Request) {
  const caller = await dockCaller(req);
  if (!caller) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });

  const parsed = bodySchema.safeParse(await readBody(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

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
    return NextResponse.json({ ok: true, item: dockItemJson(item) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
