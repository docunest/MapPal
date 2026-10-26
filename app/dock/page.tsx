"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { gmapsUrl, wazeUrl } from "@/components/DockMap";

// MapLibre touches `window` at import time — client-only.
const DockMap = dynamic(() => import("@/components/DockMap"), { ssr: false });

interface DockItem {
  id: string;
  kind: "link" | "bookmark";
  title: string;
  lat: number | null;
  lng: number | null;
  locatedBy: "link" | "search" | "gps" | "none";
  address: string | null;
  sourceUrl: string | null;
  resolvedUrl: string | null;
  seenAt: string | null;
  openCount: number;
  createdAt: string;
}

const LOCATED: Record<DockItem["locatedBy"], string> = {
  link: "exact (from link)",
  search: "found by name search — check it",
  gps: "car GPS",
  none: "not placed — opens the original link",
};

// Send a place to the car (fallback for when the phone shortcut isn't to
// hand) + everything sent/bookmarked so far, previewed on a map so a wrong
// pin is caught before driving. The car head unit polls /api/dock/items for
// the same list.
export default function DockPage() {
  const [items, setItems] = useState<DockItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const select = useCallback((id: string) => setSelected(id), []);

  function load() {
    return fetch("/api/dock/items")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(String(d.error)) : setItems(d.items)))
      .catch((e) => setError(String(e)));
  }
  useEffect(() => {
    fetch("/api/dock/items")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(String(d.error)) : setItems(d.items)))
      .catch((e) => setError(String(e)));
  }, []);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/dock/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (d.error) setError(JSON.stringify(d.error));
      else {
        setText("");
        // Show where it landed straight away.
        setSelected(d.item.id);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setItems((s) => s?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/dock/items/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Send to car</h1>
        <Link href="/" className="text-sm underline">
          Back to map
        </Link>
      </div>
      <div className="space-y-2">
        <textarea
          className="w-full rounded border p-2 text-sm"
          rows={3}
          placeholder="Paste a Google Maps / Waze link, or 41.38, 2.17"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy || !text.trim()} onClick={send}>
          {busy ? "Sending…" : "Send to car"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {items === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-3 md:sticky md:top-4 md:self-start">
            <DockMap items={items} selectedId={selected} onSelect={select} />
            <p className="mt-1 text-xs text-gray-500">
              <span className="text-amber-500">●</span> not in the car yet · <span className="text-blue-600">●</span> sent ·{" "}
              <span className="text-green-600">●</span> saved in the car · faded = approximate (found by name)
            </p>
          </div>
          <ul className="divide-y md:col-span-2">
            {items.map((i) => (
              <li
                key={i.id}
                className={`flex cursor-pointer items-start justify-between gap-2 px-2 py-2 ${selected === i.id ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                onClick={() => setSelected(i.id)}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {i.kind === "bookmark" ? "★ " : ""}
                    {i.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(i.createdAt).toLocaleString()} ·{" "}
                    <span className={i.locatedBy === "search" || i.locatedBy === "none" ? "text-amber-600" : ""}>{LOCATED[i.locatedBy]}</span>
                    {i.kind === "link" && !i.seenAt ? " · not in the car yet" : ""}
                    {i.openCount ? ` · driven to ${i.openCount}×` : ""}
                  </p>
                  {i.address && <p className="truncate text-xs text-gray-500">{i.address}</p>}
                  <p className="mt-1 flex gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
                    <a className="text-sky-600 underline" href={wazeUrl(i)} target="_blank" rel="noreferrer">
                      Waze
                    </a>
                    <a className="text-green-600 underline" href={gmapsUrl(i)} target="_blank" rel="noreferrer">
                      Google Maps
                    </a>
                    {i.sourceUrl && (
                      <a className="text-gray-500 underline" href={i.resolvedUrl ?? i.sourceUrl} target="_blank" rel="noreferrer">
                        Original link
                      </a>
                    )}
                  </p>
                </div>
                <button
                  className="text-xs text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(i.id);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
