"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { COUNTRIES, LAYER_GROUPS, type CountryCode, type PackManifest } from "@/lib/offline/packs";
import { complete, dataDate, fetchManifest, install, installed, persist, remove, type Installed } from "@/lib/offline/store";
import { useLocation } from "@/components/nearby/useLocation";
import { OfflineNearest } from "./OfflineNearest";

const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en"));
const day = (d: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "?");
const mb = (b: number) => (b < 10_000_000 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e6)} MB`);

export default function OfflineApp() {
  const { state, refresh } = useLocation();
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [have, setHave] = useState<Partial<Record<CountryCode, Installed>>>({});
  const [busy, setBusy] = useState<{ cc: CountryCode; got: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // Client-only component (dynamic, ssr: false): read once on mount.
  const [standalone] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
  );

  const reloadHave = useCallback(() => installed().then(setHave).catch(() => {}), []);

  useEffect(() => {
    reloadHave();
    fetchManifest()
      .then(setManifest)
      .catch((e) => setMsg(navigator.onLine === false || e instanceof TypeError ? "No signal — can't check for newer data now." : e instanceof Error ? e.message : String(e)));
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [reloadHave]);

  const todo = COUNTRIES.filter((c) => {
    const p = manifest?.packs[c.cc];
    const h = have[c.cc];
    return p?.web && (!h || h.version !== p.sha256 || !complete(h));
  });
  const todoBytes = todo.reduce((s, c) => s + (manifest?.packs[c.cc]?.web?.chunks.reduce((a, x) => a + x.bytes, 0) ?? 0), 0);
  const updates = todo.some((c) => have[c.cc] && have[c.cc]!.version !== manifest?.packs[c.cc]?.sha256);

  async function run(list: CountryCode[]) {
    if (!manifest) return;
    setMsg(null);
    persist();
    try {
      for (const cc of list) {
        const p = manifest.packs[cc];
        if (!p) continue;
        await install(cc, p, (got, total) => setBusy({ cc, got, total }));
        await reloadHave();
      }
      setMsg("Done ✓ — works with no signal now");
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : String(e)} — what's downloaded is kept; tap again to continue`);
    } finally {
      setBusy(null);
      reloadHave();
    }
  }

  const date = dataDate(have);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
          <Link href="/" className="rounded border px-2 py-1 text-sm">
            ←
          </Link>
          <p className="flex-1 font-semibold">📦 Offline places</p>
          <span className={`text-xs ${online ? "text-emerald-700" : "text-amber-700"}`}>{online ? "online" : "no signal"}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-3">
        <p className="text-sm text-neutral-600">
          Diesel, rest areas, groceries, toilets, water, camper services, playgrounds and the cool stuff — found with no signal.
          Same data as the car (OpenStreetMap, rebuilt monthly). Download on Starlink Wi-Fi: the phone can&apos;t tell it from the hotspot.
        </p>
        {!standalone && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            To open MapPal with no signal: Safari → Share → <b>Add to Home Screen</b>, then use that icon. (Safari may also clear
            data of sites not on the Home Screen after a few weeks unused.)
          </p>
        )}

        <section className="space-y-2">
          <h2 className="font-semibold">Countries</h2>
          <ul className="divide-y rounded-lg border bg-white">
            {COUNTRIES.map((c) => {
              const p = manifest?.packs[c.cc];
              const h = have[c.cc];
              const size = p?.web?.chunks.reduce((a, x) => a + x.bytes, 0) ?? 0;
              let status = "not downloaded";
              if (busy?.cc === c.cc) status = `downloading ${Math.round((busy.got / Math.max(1, busy.total)) * 100)}%`;
              else if (h && complete(h) && p && h.version !== p.sha256) status = `update ${mb(size)} (data ${day(h.sourceDate)})`;
              else if (h && complete(h)) status = `✓ ${short(h.count)} places · ${day(h.sourceDate)}`;
              else if (h) status = `paused ${h.done.length}/${h.total} — tap ⬇`;
              else if (p && !p.web) status = "web data not built yet";
              else if (p) status = `not downloaded · ${mb(size)}`;
              return (
                <li key={c.cc} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-lg">{c.flag}</span>
                  <span className="w-20 font-medium">{c.name}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-600">{status}</span>
                  {p?.web && !busy && (!h || !complete(h) || h.version !== p.sha256) && (
                    <button onClick={() => run([c.cc])} className="rounded border px-2 py-1 text-xs">
                      ⬇
                    </button>
                  )}
                  {h && !busy && (
                    <button
                      onClick={() => remove(c.cc).then(reloadHave)}
                      className="rounded border px-2 py-1 text-xs text-neutral-500"
                      aria-label={`Remove ${c.name}`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={!!busy || !manifest || todo.length === 0}
              onClick={() => run(todo.map((c) => c.cc))}
              className={`rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-40 ${updates ? "bg-amber-600" : "bg-neutral-900"}`}
            >
              {todo.length === 0 && manifest ? "All up to date ✓" : `${updates ? "⬇ Update" : "⬇ Download / update"}${todoBytes ? ` (${mb(todoBytes)})` : ""}`}
            </button>
            <button
              onClick={() =>
                fetchManifest()
                  .then((m) => (setManifest(m), setMsg(null)))
                  .catch((e) => setMsg(e instanceof TypeError ? "No signal — can't check for newer data now." : String(e)))
              }
              className="rounded border px-3 py-2 text-sm"
            >
              Check for updates
            </button>
          </div>
          {msg && <p className="text-sm text-neutral-700">{msg}</p>}
          {manifest && <p className="text-xs text-neutral-400">Packs published {new Date(manifest.updated).toLocaleDateString("en-GB")}.</p>}
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">
            Nearest from here {date && <span className="text-xs font-normal text-neutral-500">· offline data from {date}</span>}
          </h2>
          {state.status === "locating" && <p className="text-sm text-neutral-500">Finding you…</p>}
          {state.status === "error" && (
            <p className="text-sm text-red-700">
              {state.message}{" "}
              <button onClick={refresh} className="underline">
                Try again
              </button>
            </p>
          )}
          {state.status === "ready" &&
            (date ? (
              LAYER_GROUPS.map((g) => (
                <div key={g.id} className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{g.label}</h3>
                  <OfflineNearest lat={state.loc.lat} lng={state.loc.lng} layers={g.layers} />
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-500">Download a country first.</p>
            ))}
        </section>
      </main>
    </div>
  );
}
