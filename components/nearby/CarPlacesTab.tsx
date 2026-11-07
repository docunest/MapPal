"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { gmapsUrl, wazeUrl, type DockMapItem } from "@/components/DockMap";
import { arrow, distanceTo, isUpFront, recency, town } from "@/lib/dock/near";
import type { Located } from "./useLocation";

// MapLibre touches `window` at import time — client-only.
const DockMap = dynamic(() => import("@/components/DockMap"), { ssr: false });

interface CarPlace extends DockMapItem {
  pinned: boolean;
  openedAt: string | null;
  openCount: number;
  createdAt: string;
  sourceUrl: string | null;
  resolvedUrl: string | null;
}

function km(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : m < 20_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}

function ago(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / 1440)} days ago`;
}

// The places sent to the car (and saved in it), on the phone: same list,
// same "within 300 km or from the last 3 days" view as the head unit,
// measured from the phone. Sending and the share-shortcut debug log stay
// on /dock.
export function CarPlacesTab({ loc }: { loc: Located | null }) {
  const [items, setItems] = useState<CarPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const select = useCallback((id: string) => setSelected(id), []);

  useEffect(() => {
    fetch("/api/dock/items")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(String(d.error)) : setItems(d.items)))
      .catch((e) => setError(String(e)));
  }, []);

  const here = loc ? { lat: loc.lat, lng: loc.lng } : null;
  const sorted = useMemo(
    () =>
      [...(items ?? [])].sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          Number(b.kind === "link" && !b.seenAt) - Number(a.kind === "link" && !a.seenAt) ||
          recency(b) - recency(a),
      ),
    [items],
  );
  const upFront = useMemo(() => sorted.filter((i) => isUpFront(i, here)), [sorted, here?.lat, here?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all ? sorted : upFront;

  if (error) return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (items === null) return <p className="py-10 text-center text-sm text-neutral-500">Loading car places…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(
          [
            [false, `Near & recent`, upFront.length],
            [true, "All", sorted.length],
          ] as const
        ).map(([value, label, n]) => (
          <button
            key={label}
            onClick={() => setAll(value)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${all === value ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white"}`}
          >
            {label} <span className="ml-1 opacity-60">{n}</span>
          </button>
        ))}
        <Link href="/dock" className="ml-auto text-sm text-blue-700 underline">
          Send a link
        </Link>
      </div>
      <p className="text-xs text-neutral-500">
        {all
          ? "Everything sent to the car or saved in it."
          : here
            ? "Within 300 km of you, or sent / driven to in the last 3 days; pinned and new always — like the car."
            : "No location: only places from the last 3 days, pinned and new."}
      </p>

      <DockMap items={shown} selectedId={selected} onSelect={select} />

      {shown.length === 0 && (
        <p className="rounded border bg-white p-4 text-sm text-neutral-500">
          Nothing near or recent.{" "}
          <button className="text-blue-700 underline" onClick={() => setAll(true)}>
            Show all {sorted.length}
          </button>
        </p>
      )}
      <ul className="space-y-2">
        {shown.map((i) => {
          const d = distanceTo(here, i);
          const t = town(i.address, i.title);
          const isNew = i.kind === "link" && !i.seenAt;
          const link = i.resolvedUrl ?? i.sourceUrl;
          return (
            <li
              key={i.id}
              onClick={() => setSelected(i.id)}
              className={`flex gap-3 rounded-lg border p-3 active:bg-neutral-50 ${
                selected === i.id ? "border-blue-400 bg-blue-50" : isNew ? "border-amber-300 bg-amber-50" : "bg-white"
              }`}
            >
              <div className="text-2xl leading-none">{i.pinned ? "📌" : i.kind === "bookmark" ? "★" : "📍"}</div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-tight">{i.title}</p>
                  {d != null && here && i.lat != null && i.lng != null && (
                    <p className="shrink-0 text-sm font-medium tabular-nums text-neutral-700">
                      {d >= 300 && <span className="text-neutral-400">{arrow(here, { lat: i.lat, lng: i.lng })} </span>}~{km(d)}
                    </p>
                  )}
                </div>
                <p className="text-xs text-neutral-500">
                  {[
                    isNew ? "NEW — not in the car yet" : null,
                    t,
                    `${i.kind === "bookmark" ? "saved in the car" : "sent"} ${ago(Date.parse(i.createdAt))}`,
                    i.openCount ? `driven to ${i.openCount}×` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {i.locatedBy === "search" && <p className="text-xs text-amber-700">Approximate — found by name, check the pin</p>}
                {i.locatedBy === "none" && <p className="text-xs text-amber-700">No pin — opens the original link</p>}
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <a className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white" href={wazeUrl(i)} target="_blank" rel="noreferrer">
                    Waze
                  </a>
                  <a className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white" href={gmapsUrl(i)} target="_blank" rel="noreferrer">
                    Google Maps
                  </a>
                  {link && (
                    <a className="rounded border px-3 py-1.5 text-sm text-neutral-600" href={link} target="_blank" rel="noreferrer">
                      Link
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!all && sorted.length > upFront.length && (
        <button className="w-full rounded border bg-white py-2 text-sm text-neutral-600" onClick={() => setAll(true)}>
          Show {sorted.length - upFront.length} more — over 300 km and older than 3 days
        </button>
      )}
    </div>
  );
}
