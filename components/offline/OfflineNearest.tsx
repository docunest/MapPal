"use client";

import { useEffect, useState } from "react";
import type { RoadLayer } from "@/lib/dock/road";
import { formatDistance } from "@/lib/geo";
import { layerIcon, layerLabel, osmUrl, type OfflinePoi } from "@/lib/offline/packs";
import { nearest } from "@/lib/offline/store";
import { directionsUrl, wazeUrl } from "@/components/nearby/types";

/** Nearest places per layer from the phone's offline data — no network needed. */
export function OfflineNearest({
  lat,
  lng,
  layers,
  perLayer = 1,
  radiusM = 30_000,
}: {
  lat: number;
  lng: number;
  layers: RoadLayer[];
  perLayer?: number;
  radiusM?: number;
}) {
  const [res, setRes] = useState<Partial<Record<RoadLayer, OfflinePoi[]>> | null>(null);
  const [ms, setMs] = useState(0);
  const key = layers.join(",");

  useEffect(() => {
    let cancelled = false;
    const t0 = performance.now();
    nearest(lat, lng, key.split(",") as RoadLayer[], radiusM, perLayer)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setMs(Math.round(performance.now() - t0));
      })
      .catch(() => !cancelled && setRes({}));
    return () => {
      cancelled = true;
    };
  }, [lat, lng, key, radiusM, perLayer]);

  if (!res) return <p className="text-sm text-neutral-500">Looking up…</p>;
  return (
    <ul className="space-y-1.5">
      {layers.flatMap((l) => {
        const hits = res[l] ?? [];
        if (!hits.length)
          return [
            <li key={l} className="rounded border bg-white px-3 py-2 text-sm text-neutral-400">
              {layerIcon(l)} {layerLabel(l)} — none within {formatDistance(radiusM)}
            </li>,
          ];
        return hits.map((p) => <PoiRow key={p.osm} p={p} />);
      })}
      <li className="pt-1 text-xs text-neutral-400">
        Offline data (OpenStreetMap) · straight-line distance · {ms} ms
      </li>
    </ul>
  );
}

function PoiRow({ p }: { p: OfflinePoi }) {
  const title = p.name ?? p.brand ?? layerLabel(p.layer);
  return (
    <li className="flex items-center gap-3 rounded border bg-white px-3 py-2">
      <span className="text-xl leading-none">{layerIcon(p.layer)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <a href={osmUrl(p.osm)} target="_blank" rel="noopener noreferrer">
            {title}
          </a>
        </p>
        <p className="truncate text-xs text-neutral-500">
          {layerLabel(p.layer)}
          {p.brand && p.brand !== title ? ` · ${p.brand}` : ""}
          {p.info ? ` · ${p.info}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-neutral-700">{formatDistance(p.distM)}</span>
      <a href={wazeUrl(p.lat, p.lng)} className="shrink-0 rounded bg-sky-500 px-2 py-1 text-xs font-medium text-white">
        Waze
      </a>
      <a href={directionsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">
        Maps
      </a>
    </li>
  );
}
