"use client";

import { useEffect, useState } from "react";
import { formatDistance } from "@/lib/geo";
import type { Located } from "./useLocation";
import { SourceNotes, SourceTag } from "./sources";
import { getJson, userLang, type Sight, type SightsResponse } from "./types";

const RADII = [500, 1000, 2000, 3000];

const GROUP_TINT: Record<string, string> = {
  industry: "from-orange-100 to-orange-200",
  port: "from-sky-100 to-sky-200",
  rail: "from-slate-100 to-slate-200",
  nature: "from-emerald-100 to-emerald-200",
  water: "from-cyan-100 to-cyan-200",
  history: "from-amber-100 to-amber-200",
  structure: "from-zinc-100 to-zinc-200",
  culture: "from-rose-100 to-rose-200",
};

export function SightsTab({
  loc,
  reloadKey,
  onOpen,
}: {
  loc: Located;
  reloadKey: number;
  onOpen: (item: Sight, localLangs: string[]) => void;
}) {
  const [radius, setRadius] = useState(2000);
  const [data, setData] = useState<SightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // New location/radius → clear the old grid before the new one arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(null);
    getJson<SightsResponse>(`/api/nearby/sights?lat=${loc.lat}&lng=${loc.lng}&radius=${radius}&lang=${userLang()}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [loc.lat, loc.lng, radius, reloadKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Within</span>
        <div className="flex overflow-hidden rounded-full border border-neutral-300 bg-white">
          {RADII.map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className={`px-3 py-1 ${radius === r ? "bg-neutral-900 text-white" : ""}`}
            >
              {r < 1000 ? `${r} m` : `${r / 1000} km`}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <GridSkeleton />}
      {data && data.sights.length === 0 && (
        <p className="rounded border bg-white p-4 text-sm text-neutral-500">
          Nothing notable found within {formatDistance(radius)} — try a wider radius.
        </p>
      )}

      {data && data.sights.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.sights.map((s) => (
            <li key={s.key}>
              <button onClick={() => onOpen(s, data.localLangs)} className="block w-full overflow-hidden rounded-lg border bg-white text-left active:opacity-80">
                <div className={`relative aspect-[4/3] w-full bg-gradient-to-br ${GROUP_TINT[s.group] ?? "from-neutral-100 to-neutral-200"}`}>
                  <span className="absolute inset-0 flex items-center justify-center text-4xl">{s.icon}</span>
                  {s.image && <Photo src={s.image} />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {formatDistance(s.distance)} {s.compass}
                  </span>
                </div>
                <div className="space-y-1 p-2">
                  <p className="line-clamp-2 text-sm font-medium leading-tight">{s.name}</p>
                  <p className="text-xs text-neutral-500">
                    {s.icon} {s.kindLabel}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {s.sources.map((p) => (
                      <SourceTag key={p.source} p={{ source: p.source }} small />
                    ))}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && <SourceNotes notes={data.notes} />}
    </div>
  );
}

/** A photo over the icon tile; if it fails to load, the icon shows through. */
function Photo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // Wikimedia thumbnails from many hosts; next/image would need each configured.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
  );
}

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Loading">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="aspect-[4/5] animate-pulse rounded-lg border bg-white" />
      ))}
    </ul>
  );
}
