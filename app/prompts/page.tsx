"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Version {
  id: string;
  body: string;
  createdBy: string;
  note: string | null;
  createdAt: string;
}

interface Template {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  updatedBy: string;
  updatedAt: string;
  versions: Version[];
}

const LAST_PLACE_KEY = "mappal.lastPlace";

function lastPlace(): { name: string } | null {
  try {
    const raw = localStorage.getItem(LAST_PLACE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Shared prompt templates — one set for the whole family; agents edit the
// same ones via /api/admin/prompts. Every save is a version you can restore.
export default function PromptsPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prompts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setTemplates(d.templates);
          setPlaceholders(d.placeholders);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prompt templates</h1>
        <Link href="/" className="text-sm text-blue-700 underline">
          ← Nearby
        </Link>
      </div>
      <p className="text-sm text-neutral-600">
        What the AI is asked when you tap &ldquo;Explain&rdquo;. Shared by everyone. Only place-level placeholders exist — the AI never
        receives your own location or anything about the family.
      </p>
      <details className="rounded border bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium">Placeholders you can use</summary>
        <ul className="mt-2 space-y-1">
          {Object.entries(placeholders).map(([k, v]) => (
            <li key={k}>
              <code className="rounded bg-neutral-100 px-1">{`{{${k}}}`}</code> — {v}
            </li>
          ))}
        </ul>
      </details>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {templates?.map((t) => (
        <TemplateEditor key={t.slug} t={t} onSaved={(nt) => setTemplates((ts) => ts?.map((x) => (x.slug === nt.slug ? nt : x)) ?? null)} />
      ))}
    </div>
  );
}

function TemplateEditor({ t, onSaved }: { t: Template; onSaved: (t: Template) => void }) {
  const [body, setBody] = useState(t.body);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ prompt: string; place: string } | null>(null);
  const dirty = body !== t.body;

  async function put(payload: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prompts/${t.slug}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Save failed");
      onSaved(d.template);
      setBody(d.template.body);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const place = lastPlace();
      const res = await fetch("/api/prompts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, ...(place ? { place } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Preview failed");
      setPreview({ prompt: d.prompt, place: d.place.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id={t.slug} className="space-y-2 rounded-lg border bg-white p-4">
      <div>
        <h2 className="font-semibold">{t.title}</h2>
        <p className="text-xs text-neutral-500">
          {t.description} · last edited by {t.updatedBy} · <code>{t.slug}</code>
        </p>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={14}
        className="w-full rounded border p-2 font-mono text-xs leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What changed? (optional)"
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
        />
        <button onClick={runPreview} disabled={busy} className="rounded border px-3 py-1 text-sm disabled:opacity-50">
          Preview what gets sent
        </button>
        <button
          onClick={() => put({ body, note: note || undefined })}
          disabled={busy || !dirty}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {preview && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Exactly what the AI would receive for &ldquo;{preview.place}&rdquo;:</p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs">{preview.prompt}</pre>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-600">Versions ({t.versions.length})</summary>
        <ul className="mt-2 space-y-1">
          {t.versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500">{new Date(v.createdAt).toLocaleString()}</span>
              <span>{v.createdBy}</span>
              {v.note && <span className="text-neutral-500">— {v.note}</span>}
              {i === 0 ? (
                <span className="ml-auto text-neutral-400">current</span>
              ) : (
                <button onClick={() => put({ restore: v.id })} disabled={busy} className="ml-auto text-blue-700 underline">
                  restore
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
