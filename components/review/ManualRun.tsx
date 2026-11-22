"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KindPicker, useKindTitle, type KindNode } from "./KindPicker";
import { save, store } from "./shared";

interface Built {
  mode?: "judge" | "discover";
  runId: string;
  briefIds: string[];
  text: string;
  tokens: number;
  at: string;
  where: string;
  kinds: string[];
}
interface Imported {
  runId: string;
  saved: number;
  sent: number;
  problems: string[];
  report?: string[];
  page: string;
}

const KEY = "review.manual"; // survives the phone switching to the chat app and back

/**
 * Manual run: the same briefs Claude Code gets through the connector, as one
 * text to paste into any chat agent; then its JSON answer pasted back here.
 */
export function ManualRun({ kinds, kindFilter, center, voter, onSaved }: { kinds: KindNode[]; kindFilter: string[]; center: { lat: number; lng: number; label: string }; voter: string; onSaved: () => void }) {
  const kindTitle = useKindTitle();
  const [pick, setPick] = useState<string[]>(kindFilter);
  const [pageSize, setPageSize] = useState<number | null>(10);
  const [mode, setMode] = useState<"judge" | "discover">("judge");
  const [count, setCount] = useState(25);
  const [radius, setRadius] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reply, setReply] = useState("");
  const [model, setModel] = useState("");
  const [result, setResult] = useState<Imported | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Restore the last payload on this device (the page may reload after visiting the chat app).
    /* eslint-disable react-hooks/set-state-in-effect -- reading this device's saved state once */
    const b = store<Built | null>(KEY, null);
    if (b?.runId) setBuilt(b);
    setModel(store("review.manual.model", ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const args = () => ({ lat: center.lat, lng: center.lng, label: center.label, use_cases: pick.length ? pick : undefined, page_size: pageSize ?? undefined, by: voter, ...(mode === "discover" ? { mode, count, radius_km: radius ?? undefined } : {}) });
  const call = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
    return d;
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doPreview = () => run("preview", async () => setPreview((await call("/api/agent/manual", { ...args(), preview: true })).text));
  const doBuild = () =>
    run("build", async () => {
      const d = await call("/api/agent/manual", args());
      const b: Built = { mode, runId: d.runId, briefIds: d.briefIds, text: d.text, tokens: d.tokens, at: new Date().toISOString(), where: center.label, kinds: pick };
      setBuilt(b);
      save(KEY, b);
      setResult(null);
      setReply("");
      setShowAll(false);
    });
  const copy = async () => {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowAll(true);
      setError("Couldn't copy automatically — select the text below and copy it.");
    }
  };
  const share = async () => {
    if (built && navigator.share) await navigator.share({ text: built.text }).catch(() => undefined);
  };
  const doImport = () =>
    run("import", async () => {
      save("review.manual.model", model);
      const d = (await call("/api/agent/manual/import", { text: reply, run_id: built?.runId, by: voter, model })) as Imported;
      setResult(d);
      if (d.saved) onSaved();
    });

  const btn = "rounded-full px-3 py-1 text-sm disabled:opacity-40";
  return (
    <div className="space-y-4 text-neutral-900">
      <section className="space-y-2">
        <h3 className="font-semibold">1 · What to check</h3>
        <div className="flex gap-1 text-xs">
          {([
            ["judge", "Judge a list", "MapPal picks places from the map by your rules; the agent judges them"],
            ["discover", "Discover", "The agent names the best places itself (Google Maps, Instagram, web); MapPal cross-checks the map"],
          ] as const).map(([k, label, hint]) => (
            <button key={k} type="button" title={hint} onClick={() => setMode(k)} className={`flex-1 rounded-lg border px-2 py-1 text-left ${mode === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
              <span className="block font-semibold">{label}</span>
              <span className={`block text-[11px] ${mode === k ? "text-neutral-200" : "text-neutral-500"}`}>{hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-600">Around {center.label}. Pick a group (Food = all its sub-types) or narrow down.</p>
        <KindPicker tree={kinds} value={pick} onChange={setPick} compact />
        {mode === "judge" ? (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-neutral-600">Places per use case:</span>
            {[5, 10, 15, null].map((n) => (
              <button key={String(n)} type="button" onClick={() => setPageSize(n)} className={`rounded-full border px-2 py-0.5 ${pageSize === n ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
                {n ?? "rules' default"}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-neutral-600">Top</span>
              {[10, 15, 25].map((n) => (
                <button key={n} type="button" onClick={() => setCount(n)} className={`rounded-full border px-2 py-0.5 ${count === n ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
                  {n}
                </button>
              ))}
              <span className="pl-2 text-neutral-600">within</span>
              {[5, 10, 20, null].map((n) => (
                <button key={String(n)} type="button" onClick={() => setRadius(n)} className={`rounded-full border px-2 py-0.5 ${radius === n ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
                  {n ? `${n} km` : "rules' default"}
                </button>
              ))}
            </div>
            <p className="text-neutral-500">Sent along: your rules, what the family liked and blacklisted, and the places already known (so it finds new ones). Use an agent that can browse (ChatGPT/Claude with web search) — it must give a link for every place.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={doPreview} className={`${btn} bg-neutral-100`}>
            {busy === "preview" ? "Checking…" : "Preview (free)"}
          </button>
          <button type="button" disabled={!!busy} onClick={doBuild} className={`${btn} bg-blue-600 text-white`}>
            {busy === "build" ? "Building… (up to a minute)" : "Build payload"}
          </button>
        </div>
        {preview && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-[11px]">{preview}</pre>}
      </section>

      {built && (
        <section className="space-y-2">
          <h3 className="font-semibold">2 · Paste this into any agent{built.mode === "discover" ? " (discover)" : ""}</h3>
          <p className="text-xs text-neutral-600">
            {built.runId} · {built.mode === "discover" ? `discover: ${built.briefIds.length} use case${built.briefIds.length === 1 ? "" : "s"}` : `${built.briefIds.length} brief${built.briefIds.length === 1 ? "" : "s"}`} · {built.kinds.length ? built.kinds.map(kindTitle).join(", ") : "all kinds"} · {built.where} · ~{built.tokens.toLocaleString()} tokens · built {built.at.slice(11, 16)}. Photos are links. Works in ChatGPT, Claude.ai, Gemini…
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={`${btn} bg-neutral-900 text-white`}>
              {copied ? "Copied ✓" : "Copy payload"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" onClick={share} className={`${btn} bg-neutral-100`}>
                Share…
              </button>
            )}
            <button type="button" onClick={() => setShowAll((v) => !v)} className={`${btn} bg-neutral-100`}>
              {showAll ? "Hide text" : "Show text"}
            </button>
          </div>
          {showAll && <textarea readOnly value={built.text} rows={12} className="w-full rounded-lg border border-neutral-300 p-2 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />}

          <h3 className="pt-2 font-semibold">3 · Paste the agent&apos;s answer</h3>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={6} placeholder={built.mode === "discover" ? '{"run_id": "…", "discoveries": {"cafes": [ … ]}}' : '{"run_id": "…", "briefs": {"brf_…": [ … ]}}'} className="w-full rounded-lg border border-neutral-300 p-2 font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Which agent? (e.g. ChatGPT)" className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1 text-sm" />
            <button type="button" disabled={!!busy || !reply.trim()} onClick={doImport} className={`${btn} bg-green-700 text-white`}>
              {busy === "import" ? "Saving…" : "Save results"}
            </button>
          </div>
          {result && (
            <div className={`rounded-lg p-2 text-sm ${result.problems.length ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
              Saved {result.saved} of {result.sent} places.{" "}
              <Link href={`/agent/runs/${result.runId}`} className="underline">
                Open the pull →
              </Link>
              {result.report?.map((p) => (
                <div key={p} className="mt-1 whitespace-pre-wrap text-xs">
                  {p}
                </div>
              ))}
              {result.problems.map((p) => (
                <div key={p} className="mt-1 text-xs">
                  ⚠ {p}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}
