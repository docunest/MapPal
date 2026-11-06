"use client";

// Phase-3 test page for the scenario pipeline: one button per scenario →
// the validated, tiered shortlist for where you are. No map yet (phase 4).
// Location: ?lat=&lng= in the URL wins, otherwise this device's GPS.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocation } from "@/components/nearby/useLocation";
import type { PipelineNote } from "@/lib/scenarios/types";
import type { ShownItem, Tiers } from "@/lib/scenarios/tiers";

interface ScenarioRow {
  slug: string;
  title: string;
  icon: string | null;
  description: string;
  activeVersion: number;
}

interface AtResponse {
  error?: string;
  stop: { id: string; name: string; radiusKm: number; status: string } | null;
  version: number;
  cached: boolean;
  result: { notes: PipelineNote[]; dropped: Array<{ name: string; reason: string }>; finishedAt: string; aiTokensIn: number; aiTokensOut: number } | null;
  tiers?: Tiers;
  timeZone?: string;
  localTime?: string;
  weekday?: string;
}

interface Usage {
  warning: string | null;
  tokens: { in: number; out: number };
  calls: { agent: number };
  balance: { total?: number; currency?: string; error?: string };
}

const SECTIONS: Array<[keyof Tiers, string]> = [
  ["recommended", "Recommended"],
  ["closedToday", "Closed today"],
  ["smallOpen", "Small open alternatives"],
  ["unverified", "Unverified / hours unknown"],
];

const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

function Item({ i }: { i: ShownItem }) {
  const [open, setOpen] = useState(false);
  const closed = i.today === "closed";
  return (
    <li className="rounded-lg border bg-white p-3">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-lg ${closed ? "text-red-600" : ""}`}>{closed ? "❌" : i.big ? "🏬" : "🏪"}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {i.name}
            {i.brand && !i.name.includes(i.brand) && <span className="text-neutral-500"> · {i.brand}</span>}
          </div>
          <div className="text-sm text-neutral-600">
            {i.tierLabel} · {km(i.distance)} · <span className={i.hours.state === "open" ? "text-green-700" : closed ? "text-red-700" : ""}>{i.hours.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            <span className={`rounded px-1.5 py-0.5 ${i.verdict === "real" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{i.verdict}</span>
            {i.verdictByAi && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800">AI</span>}
            {i.sources.map((s) =>
              s.url ? (
                <a key={s.source} href={s.url} target="_blank" rel="noreferrer" className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700 underline">
                  {s.source === "osm" ? "OpenStreetMap" : s.source}
                </a>
              ) : null,
            )}
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lng}`} target="_blank" rel="noreferrer" className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">
              Google Maps
            </a>
            <a href={`https://waze.com/ul?ll=${i.lat},${i.lng}&navigate=yes`} target="_blank" rel="noreferrer" className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">
              Waze
            </a>
            <button onClick={() => setOpen((o) => !o)} className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700">
              {open ? "Hide evidence" : "Evidence"}
            </button>
          </div>
          {open && (
            <ul className="mt-2 space-y-0.5 text-xs text-neutral-600">
              {i.evidence.map((e, n) => (
                <li key={n}>
                  <span className={e.source.startsWith("ai:") ? "text-purple-700" : ""}>[{e.source.startsWith("ai:") ? `AI ${e.source.slice(3)}` : e.source}]</span> {e.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ScenariosPage() {
  const { state, refresh } = useLocation();
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<AtResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setScenarios(j.scenarios)))
      .catch((e) => setError(String(e)));
    fetch("/api/ai/usage")
      .then((r) => r.json())
      .then((j) => !j.error && setUsage(j))
      .catch(() => {});
  }, []);

  const tap = async (slug: string, force = false) => {
    if (state.status !== "ready") return;
    setActive(slug);
    setBusy(true);
    setError(null);
    setData(null);
    try {
      if (force && data?.stop) {
        const r = await fetch(`/api/scenarios/${slug}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stopId: data.stop.id, force: true }) });
        const j = await r.json();
        if (j.error) throw new Error(j.error);
      }
      const r = await fetch(`/api/scenarios/${slug}/at?lat=${state.loc.lat}&lng=${state.loc.lng}&run=1`);
      const j = (await r.json()) as AtResponse;
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
          <Link href="/" className="text-sm text-blue-700">
            ← Nearby
          </Link>
          <h1 className="flex-1 font-semibold">Scenarios <span className="text-xs font-normal text-neutral-500">test page · no map yet</span></h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {usage?.warning && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{usage.warning}</div>}
        <div className="text-sm text-neutral-600">
          {state.status === "locating" && "Locating…"}
          {state.status === "error" && (
            <span>
              {state.message}{" "}
              <button onClick={refresh} className="text-blue-700 underline">
                Retry
              </button>
            </span>
          )}
          {state.status === "ready" && `Location (${state.loc.source === "link" ? "from link" : "GPS"}): ${state.loc.lat.toFixed(4)}, ${state.loc.lng.toFixed(4)}`}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {scenarios?.map((s) => (
            <button
              key={s.slug}
              disabled={state.status !== "ready" || busy}
              onClick={() => tap(s.slug)}
              className={`rounded-xl border p-3 text-left disabled:opacity-50 ${active === s.slug ? "border-blue-500 bg-blue-50" : "bg-white"}`}
            >
              <div className="text-2xl">{s.icon}</div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-neutral-500">v{s.activeVersion}</div>
            </button>
          ))}
        </div>

        {busy && <div className="animate-pulse rounded bg-white p-3 text-sm">Running… a live run takes about 20 s; cached results are instant.</div>}
        {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</div>}

        {data && !busy && (
          <section className="space-y-3">
            <div className="text-sm text-neutral-600">
              {data.stop ? `${data.stop.name} (${data.stop.radiusKm} km, ${data.stop.status.toLowerCase()})` : "No stop"} · version {data.version} ·{" "}
              {data.cached ? "cached" : "live run"}
              {data.localTime && ` · ${data.weekday} ${data.localTime} local`}
              {data.result && ` · AI tokens ${data.result.aiTokensIn + data.result.aiTokensOut}`}
              {active && data.stop?.status !== "PAST" && (
                <button onClick={() => tap(active, true)} className="ml-2 text-blue-700 underline">
                  Re-run
                </button>
              )}
            </div>
            {data.tiers &&
              SECTIONS.map(([k, title]) =>
                data.tiers![k].length ? (
                  <div key={k}>
                    <h2 className="mb-1 text-sm font-semibold">{title}</h2>
                    <ul className="space-y-2">
                      {data.tiers![k].map((i) => (
                        <Item key={i.key} i={i} />
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            {data.result && (
              <details className="rounded border bg-white p-2 text-xs text-neutral-600">
                <summary>How this was found ({data.result.dropped.length} dropped)</summary>
                <ul className="mt-1 space-y-0.5">
                  {data.result.notes.map((n, idx) => (
                    <li key={idx}>
                      [{n.step}: {n.status}] {n.message}
                    </li>
                  ))}
                </ul>
                {data.result.dropped.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {data.result.dropped.map((d, idx) => (
                      <li key={idx}>
                        Dropped {d.name}: {d.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
