import type { DockItem } from "@prisma/client";

/** What the head unit gets — dates as ISO strings, nothing server-internal. */
export function dockItemJson(i: DockItem) {
  return {
    id: i.id,
    kind: i.kind,
    title: i.title,
    sourceUrl: i.sourceUrl,
    resolvedUrl: i.resolvedUrl,
    lat: i.lat,
    lng: i.lng,
    locatedBy: i.locatedBy,
    address: i.address,
    note: i.note,
    sentBy: i.sentBy,
    pinned: i.pinned,
    seenAt: i.seenAt?.toISOString() ?? null,
    openedAt: i.openedAt?.toISOString() ?? null,
    openCount: i.openCount,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}
