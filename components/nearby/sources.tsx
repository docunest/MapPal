"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Provenance, SourceNote } from "@/lib/sources/types";

export interface SourceInfo {
  id: string;
  label: string;
  ai: boolean;
  cost: "free" | "paid";
  homepage: string;
  state?: "on" | "off" | "not-configured";
}

const SourcesContext = createContext<Record<string, SourceInfo>>({});

/** Loads source labels once, so tags render for any source the server adds. */
export function SourcesProvider({ children }: { children: React.ReactNode }) {
  const [dir, setDir] = useState<Record<string, SourceInfo>>({});
  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d: { sources?: SourceInfo[] }) => setDir(Object.fromEntries((d.sources ?? []).map((s) => [s.id, s]))))
      .catch(() => {});
  }, []);
  return <SourcesContext.Provider value={dir}>{children}</SourcesContext.Provider>;
}

export function useSourceInfo(id: string): SourceInfo {
  const dir = useContext(SourcesContext);
  return dir[id] ?? { id, label: id, ai: false, cost: "free", homepage: "" };
}

/** AI sources that are configured and switched on. */
export function useAiSources(): SourceInfo[] {
  const dir = useContext(SourcesContext);
  return Object.values(dir).filter((s) => s.ai && s.state === "on");
}

export function SourceTag({ p, small }: { p: Provenance | { source: string; url?: string }; small?: boolean }) {
  const info = useSourceInfo(p.source);
  const cls = `inline-flex items-center gap-1 rounded-full border px-2 ${small ? "py-0 text-[10px]" : "py-0.5 text-xs"} ${
    info.ai ? "border-purple-300 bg-purple-50 text-purple-800" : "border-neutral-200 bg-neutral-50 text-neutral-600"
  }`;
  const label = (
    <>
      {info.ai && <span className="font-semibold">AI</span>}
      {info.label}
    </>
  );
  return p.url ? (
    <a href={p.url} target="_blank" rel="noopener noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
      {label}
    </a>
  ) : (
    <span className={cls}>{label}</span>
  );
}

const NOTE_STYLE: Record<SourceNote["status"], string> = {
  ok: "text-emerald-700",
  empty: "text-neutral-500",
  skipped: "text-neutral-400",
  disabled: "text-neutral-400",
  "not-configured": "text-neutral-400",
  capped: "text-amber-700",
  failed: "text-red-700",
};

/** Which sources answered this request — failures are shown, not hidden. */
export function SourceNotes({ notes }: { notes: SourceNote[] }) {
  const dir = useContext(SourcesContext);
  if (!notes.length) return null;
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">
        Sources:{" "}
        {notes
          .filter((n) => n.status === "ok" || n.status === "failed" || n.status === "capped")
          .map((n) => `${dir[n.source]?.label ?? n.source} ${n.status === "ok" ? "✓" : n.status === "capped" ? "(limit)" : "✗"}`)
          .join(" · ")}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {notes.map((n, i) => (
          <li key={i} className={NOTE_STYLE[n.status]}>
            {dir[n.source]?.label ?? n.source}: {n.status} — {n.message}
          </li>
        ))}
      </ul>
    </details>
  );
}
