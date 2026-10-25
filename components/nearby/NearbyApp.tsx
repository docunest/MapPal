"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ConfigBanner } from "./ConfigBanner";
import { DetailSheet } from "./DetailSheet";
import { SightsTab } from "./SightsTab";
import { SourcesProvider } from "./sources";
import type { Selected } from "./types";
import { UtilitiesTab } from "./UtilitiesTab";
import { useLocation } from "./useLocation";

type Tab = "utilities" | "sights";

function readTab(): Tab {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl === "sights" || fromUrl === "utilities") return fromUrl;
    return localStorage.getItem("mappal.tab") === "sights" ? "sights" : "utilities";
  } catch {
    return "utilities";
  }
}

export default function NearbyApp() {
  const { state, refresh, switchToGps } = useLocation();
  const [tab, setTab] = useState<Tab>("utilities");
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    // Last-used tab is a per-device convenience.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(readTab());
  }, []);

  const chooseTab = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("mappal.tab", t);
    } catch {
      // private mode etc. — fine
    }
  };

  const reload = () => {
    if (state.status === "ready" && state.loc.source === "link") setReloadKey((k) => k + 1);
    else refresh();
  };

  const close = useCallback(() => setSelected(null), []);

  return (
    <SourcesProvider>
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <ConfigBanner />
        <header className="sticky top-0 z-20 border-b bg-white">
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 pt-2">
            <p className="font-semibold">MapPal</p>
            <div className="min-w-0 flex-1 truncate text-xs text-neutral-500">
              {state.status === "locating" && "📍 Finding you…"}
              {state.status === "error" && <span className="text-red-600">📍 No location</span>}
              {state.status === "ready" && (
                <>
                  📍 {state.loc.source === "link" ? "From the button" : "GPS"}
                  {state.loc.accuracy ? ` ±${Math.round(state.loc.accuracy)} m` : ""} · {state.loc.lat.toFixed(4)}, {state.loc.lng.toFixed(4)}
                  {state.loc.source === "link" && (
                    <button onClick={switchToGps} className="ml-2 text-blue-700 underline">
                      use GPS
                    </button>
                  )}
                </>
              )}
            </div>
            <button onClick={reload} className="rounded border px-2 py-1 text-sm" aria-label="Refresh">
              ↻
            </button>
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="rounded border px-2 py-1 text-sm" aria-label="Menu">
                ☰
              </button>
              {menu && (
                <div className="absolute right-0 top-9 z-30 w-48 rounded-lg border bg-white py-1 text-sm shadow-lg">
                  <Link href="/saved" className="block px-3 py-2 hover:bg-neutral-50">👍 Family list</Link>
                  <Link href="/prompts" className="block px-3 py-2 hover:bg-neutral-50">✏️ Prompt templates</Link>
                  <Link href="/sources" className="block px-3 py-2 hover:bg-neutral-50">🔌 Sources</Link>
                  <Link href="/regions" className="block px-3 py-2 hover:bg-neutral-50">🗺️ Region indexer</Link>
                  <button onClick={() => signOut()} className="block w-full px-3 py-2 text-left text-neutral-500 hover:bg-neutral-50">
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
          <nav className="mx-auto mt-2 flex max-w-2xl px-4" aria-label="Mode">
            {(
              [
                ["utilities", "Utilities"],
                ["sights", "Sightseeing"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => chooseTab(id)}
                className={`flex-1 border-b-2 py-2 text-sm font-medium ${
                  tab === id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-3">
          {state.status === "locating" && <p className="py-10 text-center text-sm text-neutral-500">Finding your location…</p>}
          {state.status === "error" && (
            <div className="space-y-3 rounded-lg border border-red-200 bg-white p-4 text-sm">
              <p className="text-red-700">{state.message}</p>
              <button onClick={refresh} className="rounded bg-neutral-900 px-3 py-1.5 text-white">
                Try again
              </button>
            </div>
          )}
          {state.status === "ready" &&
            (tab === "utilities" ? (
              <UtilitiesTab
                loc={state.loc}
                reloadKey={reloadKey}
                onOpen={(item, country) => setSelected({ mode: "utility", item, country, localLangs: [] })}
              />
            ) : (
              <SightsTab
                loc={state.loc}
                reloadKey={reloadKey}
                onOpen={(item, localLangs) => setSelected({ mode: "sight", item, localLangs })}
              />
            ))}
        </main>

        {selected && <DetailSheet sel={selected} onClose={close} />}
      </div>
    </SourcesProvider>
  );
}
