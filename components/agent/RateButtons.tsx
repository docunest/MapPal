"use client";

import { useState } from "react";

// 👍/👎 on one kept place: is it real and something we'd go to?
export function RateButtons({ id, initial }: { id: string; initial: "up" | "down" | null }) {
  const [rating, setRating] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = async (next: "up" | "down") => {
    const value = rating === next ? null : next;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/agent/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: value }) });
      if (!res.ok) throw new Error();
      setRating(value);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const btn = (v: "up" | "down", label: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => set(v)}
      aria-pressed={rating === v}
      className={`rounded-full border px-3 py-1 text-lg ${rating === v ? (v === "up" ? "border-green-600 bg-green-100" : "border-red-600 bg-red-100") : "border-zinc-300 bg-white"}`}
    >
      {label}
    </button>
  );
  return (
    <span className="inline-flex items-center gap-2">
      {btn("up", "👍")}
      {btn("down", "👎")}
      {error && <span className="text-xs text-red-700">not saved</span>}
    </span>
  );
}
