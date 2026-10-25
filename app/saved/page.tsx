"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SavedSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  imageUrl: string | null;
  status: "UNKNOWN" | "MUST_VISIT" | "VISITED" | "SKIPPED";
  savedBy: string | null;
  createdAt: string;
}

const STATUS: Array<[SavedSpot["status"], string]> = [
  ["MUST_VISIT", "To visit"],
  ["VISITED", "Visited"],
  ["SKIPPED", "Skipped"],
];

// The shared family list: everything anyone 👍'd.
export default function SavedPage() {
  const [spots, setSpots] = useState<SavedSpot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/saved")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setSpots(d.spots)))
      .catch((e) => setError(String(e)));
  }, []);

  async function setStatus(id: string, status: SavedSpot["status"]) {
    setSpots((s) => s?.map((x) => (x.id === id ? { ...x, status } : x)) ?? null);
    await fetch(`/api/saved/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  async function remove(id: string) {
    if (!confirm("Remove from the family list?")) return;
    setSpots((s) => s?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/saved/${id}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Family list</h1>
        <Link href="/" className="text-sm text-blue-700 underline">
          ← Nearby
        </Link>
      </div>
      <p className="text-sm text-neutral-500">Everything anyone in the family liked with 👍. Shared by everyone.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {spots && spots.length === 0 && <p className="text-sm text-neutral-500">Nothing yet — tap 👍 Save on a place.</p>}
      <ul className="space-y-2">
        {spots?.map((s) => (
          <li key={s.id} className="flex gap-3 rounded-lg border bg-white p-3">
            {s.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded bg-neutral-100" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium leading-tight">{s.name}</p>
              <p className="text-xs text-neutral-500">
                {s.kind.replace(/[-_]/g, " ")} · saved by {s.savedBy ?? "someone"}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {STATUS.map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStatus(s.id, value)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${s.status === value ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
                  >
                    {label}
                  </button>
                ))}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-blue-700 underline"
                >
                  Navigate
                </a>
                <button onClick={() => remove(s.id)} className="text-xs text-neutral-400 underline">
                  remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
