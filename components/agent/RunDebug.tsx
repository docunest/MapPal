"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Legend, type DebugData } from "./DebugMap";

const DebugMap = dynamic(() => import("./DebugMap").then((m) => m.DebugMap), { ssr: false, loading: () => <div className="h-full w-full bg-neutral-100" /> });

interface DebugReply {
  runId: string;
  run: { zone: { cafeCircles: Array<{ lat: number; lng: number; radiusM: number; label: string }>; explore: { lat: number; lng: number; radiusM: number } } } | null;
  hints: DebugData["hints"];
  destinations: DebugData["destinations"];
  estimate: DebugData["estimate"];
  events: Array<{ id: string; at: string; kind: string; summary: string; tokens: number; lat: number | null; lng: number | null }>;
  candidates: NonNullable<DebugData["candidates"]>;
  cells: NonNullable<DebugData["cells"]>;
}

/** The run under the hood: everything with its correlation id, on a map and as a timeline. */
export function RunDebug({ runId }: { runId: string }) {
  const [d, setD] = useState<DebugReply | null>(null);
  const [focus, setFocus] = useState<DebugData["focus"]>(null);
  const [kind, setKind] = useState("");
  useEffect(() => {
    fetch(`/api/agent/runs/${encodeURIComponent(runId)}/debug`).then((r) => r.json()).then(setD).catch(() => undefined);
  }, [runId]);
  const data: DebugData = useMemo(
    () => ({
      cells: d?.cells,
      hints: d?.hints,
      destinations: d?.destinations,
      estimate: d?.estimate,
      candidates: d?.candidates,
      circles: d?.run ? [...d.run.zone.cafeCircles.map((c) => ({ ...c, kind: "cafes" as const })), { ...d.run.zone.explore, label: "exploration", kind: "explore" as const }] : [],
      focus,
    }),
    [d, focus],
  );
  if (!d) return <p className="text-sm text-neutral-500">Loading the debug view…</p>;
  const byKind = new Map<string, { n: number; tokens: number }>();
  for (const e of d.events) byKind.set(e.kind, { n: (byKind.get(e.kind)?.n ?? 0) + 1, tokens: (byKind.get(e.kind)?.tokens ?? 0) + e.tokens });
  const fates = new Map<string, number>();
  for (const c of d.candidates) fates.set(c.fate, (fates.get(c.fate) ?? 0) + 1);
  const events = d.events.filter((e) => !kind || e.kind === kind);
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        Correlation id <code className="rounded bg-neutral-100 px-1">{d.runId}</code> — every row below and every dot on the map carries it. Tap a dot for details.
      </p>
      <div className="h-[60vh] overflow-hidden rounded-xl border border-neutral-200">
        <DebugMap data={data} />
      </div>
      <Legend />
      <div className="flex flex-wrap gap-2 text-xs">
        {[...fates].map(([f, n]) => (
          <span key={f} className="rounded bg-neutral-100 px-2 py-0.5">
            {f}: {n}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        <button type="button" onClick={() => setKind("")} className={`rounded-full px-2 py-0.5 ${!kind ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
          all ({d.events.length})
        </button>
        {[...byKind].map(([k, v]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-2 py-0.5 ${kind === k ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
            {k} ({v.n}{v.tokens ? `, ${v.tokens.toLocaleString()} tok` : ""})
          </button>
        ))}
      </div>
      <ol className="max-h-[50vh] divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200 text-xs">
        {events.map((e) => (
          <li key={e.id} className={`flex gap-2 px-2 py-1 ${e.lat !== null ? "cursor-pointer hover:bg-blue-50" : ""}`} onClick={() => e.lat !== null && e.lng !== null && setFocus({ lat: e.lat, lng: e.lng, zoom: 15 })}>
            <span className="w-16 shrink-0 text-neutral-400">{e.at.slice(11, 19)}</span>
            <span className="w-28 shrink-0 font-mono text-neutral-500">{e.kind}</span>
            <span className="flex-1">{e.summary}</span>
            {e.tokens > 0 && <span className="shrink-0 text-neutral-500">{e.tokens.toLocaleString()} tok</span>}
          </li>
        ))}
        {!events.length && <li className="px-2 py-1 text-neutral-500">No events logged for this id (runs before 2026-11-21 evening have none).</li>}
      </ol>
    </div>
  );
}
