"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Legend, type DebugData } from "./DebugMap";

const DebugMap = dynamic(() => import("./DebugMap").then((m) => m.DebugMap), { ssr: false, loading: () => <div className="h-full w-full bg-neutral-100" /> });

interface Overview {
  cells: NonNullable<DebugData["cells"]>;
  layers: Record<string, number>;
  jobs: Array<{ id: string; cells: number; at?: string }>;
}
interface Travel {
  why: string;
  estimate: DebugData["estimate"];
  hints: NonNullable<DebugData["hints"]>;
  destinations: NonNullable<DebugData["destinations"]>;
}

/** The place index (which cells are stored, failed, missing) and every location hint, on one map; index more from here. */
export function IndexDebug() {
  const params = useSearchParams();
  const [ov, setOv] = useState<Overview | null>(null);
  const [travel, setTravel] = useState<Travel | null>(null);
  const [radius, setRadius] = useState(30);
  const [area, setArea] = useState<{ lat: number; lng: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const [jobEvents, setJobEvents] = useState<Array<{ at: string; summary: string }>>([]);
  const job = params.get("job");

  const load = useCallback(() => {
    fetch("/api/agent/index").then((r) => r.json()).then(setOv).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    fetch("/api/agent/travel").then((r) => r.json()).then(setTravel).catch(() => undefined);
  }, [load]);
  useEffect(() => {
    if (job) fetch(`/api/agent/runs/${encodeURIComponent(job)}/debug`).then((r) => r.json()).then((d) => setJobEvents(d.events ?? [])).catch(() => undefined);
  }, [job]);

  const runIndex = async (c: { lat: number; lng: number }) => {
    setArea(c);
    setBusy(true);
    stop.current = false;
    let jobId: string | undefined;
    setLog([`Indexing ${radius} km around ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}…`]);
    for (let round = 1; round <= 40 && !stop.current; round++) {
      try {
        const r = await fetch("/api/agent/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, radiusKm: radius, job: jobId }) }).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        jobId = r.job;
        setLog((l) => [...l, `round ${round} (${r.job}): ${r.cells} cells — ${r.fresh.length} stored, +${r.fetched.length} fetched, ${r.failed.length} failed, ${r.missing.length} left`]);
        load();
        if (!r.missing.length) break;
      } catch (e) {
        setLog((l) => [...l, `error: ${e instanceof Error ? e.message : String(e)}`]);
        break;
      }
    }
    setBusy(false);
  };

  const data: DebugData = useMemo(
    () => ({ cells: ov?.cells, hints: travel?.hints, destinations: travel?.destinations, estimate: travel?.estimate, circles: area ? [{ ...area, radiusM: radius * 1000, label: "index area", kind: "area" as const }] : [] }),
    [ov, travel, area, radius],
  );
  const ok = ov?.cells.filter((c) => c.status === "ok") ?? [];
  const failed = ov?.cells.filter((c) => c.status === "failed") ?? [];
  return (
    <div className="space-y-3">
      <div className="h-[62vh] overflow-hidden rounded-xl border border-neutral-200">
        <DebugMap data={data} onCenter={busy ? undefined : runIndex} />
      </div>
      <Legend />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Index radius:</span>
        {[15, 30, 60, 100].map((r) => (
          <button key={r} type="button" onClick={() => setRadius(r)} className={`rounded-full px-3 py-1 ${radius === r ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
            {r} km
          </button>
        ))}
        {travel?.estimate && (
          <button type="button" disabled={busy} onClick={() => runIndex({ lat: travel.estimate!.lat, lng: travel.estimate!.lng })} className="rounded-full bg-blue-600 px-3 py-1 text-white disabled:opacity-50">
            Index around my best-guess location
          </button>
        )}
        {busy && (
          <button type="button" onClick={() => (stop.current = true)} className="rounded-full bg-red-600 px-3 py-1 text-white">
            Stop
          </button>
        )}
      </div>
      {log.length > 0 && <pre className="max-h-40 overflow-y-auto rounded bg-neutral-900 p-2 text-[11px] text-green-200">{log.join("\n")}</pre>}
      <section className="rounded-xl border border-neutral-200 p-3 text-sm">
        <h2 className="font-semibold">Place index</h2>
        <p>
          {ok.length} cells stored ({ok.reduce((s, c) => s + c.count, 0).toLocaleString()} places: {Object.entries(ov?.layers ?? {}).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(", ")}), {failed.length} failed. A cell ≈ 30 × 20 km; refreshed after 30 days.
        </p>
        {failed.length > 0 && (
          <ul className="mt-1 text-xs text-red-700">
            {failed.slice(0, 10).map((c) => (
              <li key={c.geohash}>
                {c.geohash}: {c.error}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-2 font-medium">Recent index jobs</h3>
        <ul className="text-xs">
          {ov?.jobs.map((j) => (
            <li key={j.id}>
              <a href={`/agent/debug?job=${j.id}`} className="underline">
                {j.id}
              </a>{" "}
              — {j.cells} cells, {j.at?.slice(0, 16).replace("T", " ")}
            </li>
          ))}
        </ul>
      </section>
      {job && (
        <section className="rounded-xl border border-neutral-200 p-3 text-xs">
          <h2 className="font-semibold">Job {job}</h2>
          <ol>
            {jobEvents.map((e, i) => (
              <li key={i}>
                {e.at.slice(11, 19)} {e.summary}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="rounded-xl border border-neutral-200 p-3 text-sm">
        <h2 className="font-semibold">Where the family is</h2>
        <p>{travel?.why ?? "…"}</p>
        <ul className="mt-1 max-h-60 overflow-y-auto text-xs">
          {travel?.hints.slice(0, 40).map((h, i) => (
            <li key={i} className={h.used ? "" : "text-neutral-400"}>
              {h.used ? "✓" : "·"} {h.label} · {h.source} · {String(h.at).slice(0, 16).replace("T", " ")} · weight {h.weight}
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
