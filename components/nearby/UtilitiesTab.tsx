"use client";

import { useEffect, useMemo, useState } from "react";
import type OpeningHours from "opening_hours";
import { formatDistance } from "@/lib/geo";
import type { Located } from "./useLocation";
import { evaluateHours, loadOpeningHours, type HoursState } from "./openingHours";
import { SourceNotes, SourceTag } from "./sources";
import { directionsUrl, getJson, type NearbyUtility, type UtilitiesResponse, type UtilityCategory } from "./types";

const CATEGORIES: Array<{ id: UtilityCategory; label: string; icon: string }> = [
  { id: "fuel", label: "Fuel", icon: "⛽" },
  { id: "restaurants", label: "Restaurants", icon: "🍽️" },
  { id: "groceries", label: "Groceries", icon: "🛒" },
];

const HOURS_STYLE: Record<HoursState["state"], string> = {
  open: "bg-emerald-50 text-emerald-800 border-emerald-200",
  closed: "bg-red-50 text-red-700 border-red-200",
  unknown: "bg-neutral-50 text-neutral-500 border-neutral-200",
};

export function UtilitiesTab({
  loc,
  reloadKey,
  onOpen,
}: {
  loc: Located;
  reloadKey: number;
  onOpen: (item: NearbyUtility, country?: string) => void;
}) {
  const [cat, setCat] = useState<UtilityCategory>("fuel");
  const [openOnly, setOpenOnly] = useState(true);
  const [data, setData] = useState<UtilitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [OH, setOH] = useState<typeof OpeningHours | null>(null);

  useEffect(() => {
    loadOpeningHours().then((lib) => setOH(() => lib)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    // New location → clear the old list before the new one arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(null);
    getJson<UtilitiesResponse>(`/api/nearby/utilities?lat=${loc.lat}&lng=${loc.lng}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [loc.lat, loc.lng, reloadKey]);

  const hours = useMemo(() => {
    const m = new Map<string, HoursState>();
    if (!data || !OH) return m;
    for (const p of data.places) m.set(p.key, evaluateHours(OH, p.openingHours, { ...p, country: data.country }));
    return m;
  }, [data, OH]);

  const inCat = data?.places.filter((p) => p.category === cat) ?? [];
  const closed = inCat.filter((p) => hours.get(p.key)?.state === "closed");
  const shown = openOnly ? inCat.filter((p) => hours.get(p.key)?.state !== "closed") : inCat;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => {
          const n = data?.places.filter((p) => p.category === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                cat === c.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
              }`}
            >
              {c.icon} {c.label}
              {n !== undefined && <span className="ml-1 opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
        Hide places that are closed now
        {openOnly && closed.length > 0 && <span className="text-neutral-400">({closed.length} hidden)</span>}
      </label>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!data && !error && <ListSkeleton />}

      {data && shown.length === 0 && (
        <p className="rounded border bg-white p-4 text-sm text-neutral-500">
          Nothing found within {formatDistance(data.radius[cat] ?? 0)}.
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((p) => (
          <UtilityCard key={p.key} p={p} hours={hours.get(p.key)} onOpen={() => onOpen(p, data?.country)} />
        ))}
      </ul>

      {data && (
        <div className="space-y-1 pt-2">
          <p className="text-xs text-neutral-400">
            Searched {formatDistance(data.radius[cat] ?? 0)} around you. Opening hours are only known for some places.
          </p>
          <SourceNotes notes={data.notes} />
        </div>
      )}
    </div>
  );
}

function UtilityCard({ p, hours, onOpen }: { p: NearbyUtility; hours?: HoursState; onOpen: () => void }) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        className="flex gap-3 rounded-lg border bg-white p-3 active:bg-neutral-50"
      >
        <div className="text-2xl leading-none">{p.icon}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-tight">{p.name}</p>
            <p className="shrink-0 text-sm font-medium tabular-nums text-neutral-700">
              {formatDistance(p.distance)} <span className="text-xs text-neutral-400">{p.compass}</span>
            </p>
          </div>
          <p className="text-xs text-neutral-500">
            {p.kindLabel}
            {p.brand ? ` · ${p.brand}` : ""}
            {p.address ? ` · ${p.address}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {hours && <span className={`rounded border px-1.5 py-0.5 text-xs ${HOURS_STYLE[hours.state]}`}>{hours.label}</span>}
            {p.badges.map((b) => (
              <span key={b} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">
                {b}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap gap-1">
              {p.sources.map((s) => (
                <SourceTag key={s.source} p={s} small />
              ))}
            </div>
            <a
              href={directionsUrl(p.lat, p.lng)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white"
            >
              Navigate
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

export function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-label="Loading">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="h-20 animate-pulse rounded-lg border bg-white" />
      ))}
    </ul>
  );
}
