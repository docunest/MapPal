"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ago, iconFor, km, VOTE_UI, type ReviewPlace } from "./shared";

interface Cell {
  geohash: string;
  status: string;
  count: number;
  ageDays: number | null;
  error: string | null;
}
interface BriefRow {
  id: string;
  runId: string;
  useCase: string;
  page: number;
  status: string;
  candidates: Array<{ id: string; name: string }>;
  excluded: number;
  tokens: number;
  createdAt: string;
  layers: { usecase?: { version: number } };
}

const fate = (p: ReviewPlace) => (!p.checked ? { t: "not judged", c: "bg-neutral-100 text-neutral-600" } : p.agent?.keep ? { t: `AI pick ${Math.round((p.agent.confidence ?? 0) * 100)}%`, c: "bg-green-100 text-green-800" } : { t: "AI: not picked", c: "bg-red-50 text-red-700" });

/** Browse mode's side panel: the places in the area as a list, and the index / agent controls (reindex when you say so). */
export function BrowsePanel({ places, voter, center, radiusKm, onSelect, onIndexed }: { places: ReviewPlace[]; voter: string; center: { lat: number; lng: number; label: string }; radiusKm: number | null; onSelect: (p: ReviewPlace) => void; onIndexed: () => void }) {
  const [tab, setTab] = useState<"list" | "index">("list");
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const r = radiusKm ?? 50;

  const loadCells = useCallback(() => {
    fetch(`/api/agent/index?lat=${center.lat}&lng=${center.lng}&r=${r}`).then((x) => x.json()).then((d) => setCells(d.cells ?? [])).catch(() => undefined);
  }, [center.lat, center.lng, r]);
  useEffect(() => {
    if (tab !== "index") return;
    loadCells();
    fetch("/api/agent/briefs").then((x) => x.json()).then((d) => setBriefs(d.briefs ?? [])).catch(() => undefined);
  }, [tab, loadCells]);

  const index = async (refresh: boolean) => {
    if (refresh && !window.confirm(`Read every cell within ${r} km from OpenStreetMap again? Free, but it takes ~20–60 s per cell.`)) return;
    setBusy(true);
    stop.current = false;
    let job: string | undefined;
    setLog([`${refresh ? "Reindexing" : "Indexing missing cells"} within ${r} km of ${center.label}…`]);
    for (let round = 1; round <= 60 && !stop.current; round++) {
      try {
        const d = await fetch("/api/agent/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, radiusKm: r, refresh: refresh && round === 1 ? true : refresh, job }) }).then((x) => x.json());
        if (d.error) throw new Error(d.error);
        job = d.job;
        setLog((l) => [...l, `round ${round}: +${d.fetched.length} cells (${d.fetched.reduce((s: number, f: { count: number }) => s + f.count, 0)} places), ${d.failed.length} failed, ${d.missing.length} left`]);
        loadCells();
        if (!d.missing.length) break;
        if (refresh) break; // a refresh pass re-reads everything it can in one go; press again for the rest
      } catch (e) {
        setLog((l) => [...l, `error: ${e instanceof Error ? e.message : String(e)}`]);
        break;
      }
    }
    setBusy(false);
    onIndexed();
  };

  const counts = { picks: places.filter((p) => p.agent?.keep).length, judged: places.filter((p) => p.checked).length, unjudged: places.filter((p) => !p.checked).length, mine: places.filter((p) => p.votes?.[voter]).length };
  const by = (s: string) => cells?.filter((c) => c.status === s).length ?? 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-neutral-200 p-2 text-sm">
        <button type="button" onClick={() => setTab("list")} className={`rounded-full px-3 py-1 ${tab === "list" ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
          Places ({places.length})
        </button>
        <button type="button" onClick={() => setTab("index")} className={`rounded-full px-3 py-1 ${tab === "index" ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
          Index &amp; agent
        </button>
      </div>
      {tab === "list" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-xs text-neutral-500">
            {counts.picks} AI picks · {counts.judged} judged · {counts.unjudged} not judged yet · you voted on {counts.mine}. Nearest first.
          </p>
          <ul className="divide-y divide-neutral-100">
            {places.slice(0, 300).map((p) => {
              const f = fate(p);
              const mine = p.votes?.[voter];
              return (
                <li key={p.key}>
                  <button type="button" onClick={() => onSelect(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50">
                    <span className="text-lg">{iconFor(p.kind)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="flex flex-wrap gap-1 text-[11px]">
                        <span className="text-neutral-500">{km(p.distanceM)}</span>
                        <span className={`rounded px-1 ${f.c}`}>{f.t}</span>
                        {p.visitedAt && <span className="rounded bg-blue-100 px-1 text-blue-800">been</span>}
                        {p.sentAt && <span className="rounded bg-indigo-100 px-1 text-indigo-800">🚐</span>}
                        {Object.entries(p.votes ?? {})
                          .filter(([v]) => v !== voter)
                          .map(([v, x]) => (
                            <span key={v} className="rounded border border-neutral-200 px-1">
                              {v}: {VOTE_UI[x].icon}
                            </span>
                          ))}
                      </span>
                    </span>
                    {mine && (
                      <span className="text-lg" style={{ color: VOTE_UI[mine].color }} title={VOTE_UI[mine].label}>
                        {VOTE_UI[mine].icon}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {!places.length && <p className="p-3 text-sm text-neutral-500">Nothing here with these filters. Try “Everything found” in the filter, a bigger distance, or index the area (Index &amp; agent).</p>}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
          <section>
            <h3 className="font-semibold">Place index around {center.label}</h3>
            {cells ? (
              <p className="text-xs text-neutral-600">
                {cells.length} cells within {r} km: {by("ok")} fresh, {by("stale")} stale (&gt; 30 days), {by("failed")} failed, {by("missing")} not indexed · {cells.reduce((s, c) => s + c.count, 0).toLocaleString()} places stored
                {cells.some((c) => c.ageDays !== null) ? ` · oldest ${Math.max(...cells.map((c) => c.ageDays ?? 0))} days` : ""}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">Loading…</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => index(false)} className="rounded-full bg-blue-600 px-3 py-1 text-white disabled:opacity-50">
                Index missing &amp; stale
              </button>
              <button type="button" disabled={busy} onClick={() => index(true)} className="rounded-full bg-amber-600 px-3 py-1 text-white disabled:opacity-50">
                Reindex everything here
              </button>
              {busy && (
                <button type="button" onClick={() => (stop.current = true)} className="rounded-full bg-red-600 px-3 py-1 text-white">
                  Stop
                </button>
              )}
            </div>
            {log.length > 0 && <pre className="mt-2 max-h-36 overflow-y-auto rounded bg-neutral-900 p-2 text-[11px] text-green-200">{log.join("\n")}</pre>}
            {cells?.some((c) => c.status === "failed") && (
              <ul className="mt-1 text-xs text-red-700">
                {cells.filter((c) => c.status === "failed").slice(0, 5).map((c) => (
                  <li key={c.geohash}>
                    {c.geohash}: {c.error}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-neutral-500">The map shades the cells: green fresh · amber stale · red failed · grey not indexed. Change the area with the filter (⚙︎) or “Search here” on the map.</p>
          </section>
          <section>
            <h3 className="font-semibold">Agent pulls</h3>
            <ul className="divide-y divide-neutral-100 text-xs">
              {briefs.map((b) => (
                <li key={b.id} className="py-1">
                  <Link href={`/agent/runs/${b.runId}`} className="font-mono underline">
                    {b.id}
                  </Link>{" "}
                  · {b.useCase} p.{b.page} · {b.candidates.length} places · {b.excluded} excluded · rules v{b.layers.usecase?.version ?? "?"} · {b.tokens.toLocaleString()} tok · {b.status} · {ago(b.createdAt)}
                </li>
              ))}
              {!briefs.length && <li className="py-1 text-neutral-500">No briefs pulled yet. Ask Claude Code to “recheck location”.</li>}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link href="/agent/runs" className="rounded-full bg-neutral-100 px-3 py-1">
                All pulls →
              </Link>
              <Link href="/agent/debug" className="rounded-full bg-neutral-100 px-3 py-1">
                Debug map →
              </Link>
              <Link href="/agent/budget" className="rounded-full bg-neutral-100 px-3 py-1">
                Budget log →
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
