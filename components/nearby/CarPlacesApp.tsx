"use client";

import { useState } from "react";
import Link from "next/link";
import { CarPlacesTab } from "./CarPlacesTab";
import { useLocation } from "./useLocation";

const KEY = "mappal.dockToken";

function readToken(): string | null {
  try {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("t");
    if (fromHash) {
      localStorage.setItem(KEY, fromHash);
      history.replaceState(null, "", location.pathname); // keep the token out of screenshots / shares
      return fromHash;
    }
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// /car: the Car places tab on its own, signed in by the dock token instead
// of a MapPal login. Same header and tabs as the main app — Utilities and
// Sightseeing need the MapPal login.
export default function CarPlacesApp() {
  const [token, setToken] = useState<string | null>(readToken);
  const { state } = useLocation();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 pt-2">
          <p className="font-semibold">MapPal</p>
          <div className="min-w-0 flex-1 truncate text-xs text-neutral-500">
            {state.status === "locating" && "📍 Finding you…"}
            {state.status === "error" && <span className="text-red-600">📍 No location</span>}
            {state.status === "ready" && `📍 GPS ±${Math.round(state.loc.accuracy ?? 0)} m`}
          </div>
        </div>
        <nav className="mx-auto mt-2 flex max-w-2xl px-4" aria-label="Mode">
          <Link href="/?tab=utilities" className="flex-1 border-b-2 border-transparent py-2 text-center text-sm font-medium text-neutral-500">
            Utilities
          </Link>
          <Link href="/?tab=sights" className="flex-1 border-b-2 border-transparent py-2 text-center text-sm font-medium text-neutral-500">
            Sightseeing
          </Link>
          <span className="flex-1 border-b-2 border-neutral-900 py-2 text-center text-sm font-medium text-neutral-900">🚐 Car places</span>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-3">
        {token ? (
          <CarPlacesTab loc={state.status === "ready" ? state.loc : null} token={token} />
        ) : (
          <form
            className="space-y-2 rounded-lg border bg-white p-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value.trim();
              if (!v) return;
              try {
                localStorage.setItem(KEY, v);
              } catch {
                // private mode: works until the tab closes
              }
              setToken(v);
            }}
          >
            <p>Open this page with the car link (…/car#t=…), or paste the dock token:</p>
            <input name="t" className="w-full rounded border p-2" placeholder="dock token" />
            <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Open</button>
          </form>
        )}
      </main>
    </div>
  );
}
