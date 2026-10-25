"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SourceRow {
  id: string;
  label: string;
  description: string;
  type: string;
  cost: "free" | "paid";
  ai: boolean;
  homepage: string;
  requiresEnv: string[];
  state: "on" | "off" | "not-configured";
  usage: Array<{ sku: string; today: number; month: number; cap: { daily: number; monthly: number } }>;
  likes: { up: number; down: number };
}

interface EnvCheck {
  name: string;
  ok: boolean;
  effect: string;
}

interface ServerConfig {
  required: EnvCheck[];
  optional: EnvCheck[];
  database: { ok: boolean; error?: string };
}

// Every pluggable source: on/off, paid usage vs caps, and how useful people
// found it (👍/👎 on details blocks). Plus which server settings are set.
export default function SourcesPage() {
  const [rows, setRows] = useState<SourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const load = () =>
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setRows(d.sources)))
      .catch((e) => setError(String(e)));

  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string, enabled: boolean) {
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, state: enabled ? "on" : "off" } : r)) ?? null);
    const res = await fetch(`/api/sources/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sources</h1>
        <Link href="/" className="text-sm text-blue-700 underline">
          ← Nearby
        </Link>
      </div>
      <p className="text-sm text-neutral-600">
        Where MapPal&apos;s data comes from. Paid sources stop at their daily and monthly caps (set inside the providers&apos; free
        allowances), so they can&apos;t run up a bill.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {config && (
        <section className="space-y-1 rounded-lg border bg-white p-3 text-sm">
          <h2 className="font-medium">Server setup</h2>
          <p className="text-xs text-neutral-500">Set in the hosting dashboard (Vercel → Settings → Environment Variables). Names only — values are never shown.</p>
          <ul className="space-y-1">
            <li className={config.database.ok ? "text-emerald-700" : "text-red-700"}>
              {config.database.ok ? "✓" : "✗"} Database {config.database.ok ? "reachable, up to date" : `— ${config.database.error}`}
            </li>
            {[...config.required.map((c) => ({ ...c, required: true })), ...config.optional.map((c) => ({ ...c, required: false }))].map((c) => (
              <li key={c.name} className={c.ok ? "text-emerald-700" : c.required ? "text-red-700" : "text-amber-800"}>
                {c.ok ? "✓" : "✗"} <code>{c.name}</code>
                {!c.ok && <span className="text-neutral-600"> — {c.required ? "required. " : ""}{c.effect}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="space-y-2">
        {rows?.map((s) => (
          <li key={s.id} className="space-y-2 rounded-lg border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {s.label}
                  </a>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${s.cost === "paid" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {s.cost}
                  </span>
                  {s.ai && <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-800">AI</span>}
                </p>
                <p className="text-xs text-neutral-500">{s.description}</p>
              </div>
              {s.state === "not-configured" ? (
                <span className="shrink-0 text-right text-xs text-neutral-400">
                  Needs {s.requiresEnv.join(", ")}
                  <br />
                  on the server
                </span>
              ) : (
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.state === "on"} onChange={(e) => toggle(s.id, e.target.checked)} />
                  {s.state === "on" ? "On" : "Off"}
                </label>
              )}
            </div>
            {s.usage.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-left text-neutral-500">
                  <tr>
                    <th className="font-normal">Calls</th>
                    <th className="font-normal">Today</th>
                    <th className="font-normal">This month</th>
                  </tr>
                </thead>
                <tbody>
                  {s.usage.map((u) => (
                    <tr key={u.sku}>
                      <td className="text-neutral-600">{u.sku.replace(/-/g, " ")}</td>
                      <td className="tabular-nums">
                        {u.today} / {u.cap.daily}
                      </td>
                      <td className="tabular-nums">
                        {u.month} / {u.cap.monthly}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-neutral-500">
              Useful: 👍 {s.likes.up} · 👎 {s.likes.down}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
