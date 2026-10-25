"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlaceRef } from "@/lib/sources/types";
import { SourceTag, useAiSources } from "./sources";
import { getJson } from "./types";

interface Explained {
  text: string;
  model: string;
  source: string;
  template: string;
}

const BUTTONS = [
  { template: "explain-kid", label: "Explain it for kids" },
  { template: "explain-adult", label: "Explain it to me" },
];

/**
 * AI explanation from a shared prompt template (/prompts). Only place-level
 * facts go into the prompt — never the family's position (docs/PLAN.md §7d).
 */
export function ExplainPanel({ place }: { place: PlaceRef }) {
  const ai = useAiSources();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Explained | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ai.length) return null;

  async function explain(template: string) {
    setBusy(template);
    setError(null);
    try {
      setResult(
        await getJson<Explained>("/api/nearby/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place, template }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-purple-200 bg-purple-50/40 p-3">
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.template}
            onClick={() => explain(b.template)}
            disabled={!!busy}
            className="rounded-full border border-purple-300 bg-white px-3 py-1 text-sm text-purple-900 disabled:opacity-50"
          >
            {busy === b.template ? "Thinking…" : b.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && (
        <div className="space-y-2">
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-800">{result.text}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <SourceTag p={{ source: result.source }} small /> {result.model} · written by AI from the sources above ·{" "}
            <Link href={`/prompts#${result.template}`} className="underline">
              edit prompt
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
