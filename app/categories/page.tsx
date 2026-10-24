"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface OverpassFilterRow {
  key: string;
  value: string;
}

interface Category {
  id: string;
  slug: string;
  label: string;
  description: string;
  elementTypes: string[];
  overpassFilters: { key: string; value?: string }[];
  include: string[];
  exclude: string[];
  searchPhrases: string[];
  extractFields: string[];
}

const ELEMENT_TYPES = ["node", "way", "relation"] as const;

interface FormState {
  slug: string;
  label: string;
  description: string;
  elementTypes: Set<string>;
  overpassFilters: OverpassFilterRow[];
  include: string;
  exclude: string;
  searchPhrases: string;
  extractFields: string;
}

function emptyForm(): FormState {
  return {
    slug: "",
    label: "",
    description: "",
    elementTypes: new Set(["node", "way"]),
    overpassFilters: [{ key: "", value: "" }],
    include: "",
    exclude: "",
    searchPhrases: "",
    extractFields: "",
  };
}

function categoryToForm(c: Category): FormState {
  return {
    slug: c.slug,
    label: c.label,
    description: c.description,
    elementTypes: new Set(c.elementTypes),
    overpassFilters: c.overpassFilters.length
      ? c.overpassFilters.map((f) => ({ key: f.key, value: f.value ?? "" }))
      : [{ key: "", value: "" }],
    include: c.include.join("\n"),
    exclude: c.exclude.join("\n"),
    searchPhrases: c.searchPhrases.join("\n"),
    extractFields: c.extractFields.join("\n"),
  };
}

function linesToArray(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.categories ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function startEdit(c: Category) {
    setEditingId(c.id);
    setForm(categoryToForm(c));
    setError(null);
  }

  function startNew() {
    setEditingId("new");
    setForm(emptyForm());
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setError(null);
  }

  function toggleElementType(type: string) {
    setForm((prev) => {
      const next = new Set(prev.elementTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { ...prev, elementTypes: next };
    });
  }

  function updateFilterRow(index: number, field: "key" | "value", value: string) {
    setForm((prev) => {
      const rows = [...prev.overpassFilters];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, overpassFilters: rows };
    });
  }

  function addFilterRow() {
    setForm((prev) => ({ ...prev, overpassFilters: [...prev.overpassFilters, { key: "", value: "" }] }));
  }

  function removeFilterRow(index: number) {
    setForm((prev) => ({ ...prev, overpassFilters: prev.overpassFilters.filter((_, i) => i !== index) }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        slug: form.slug.trim(),
        label: form.label.trim(),
        description: form.description.trim(),
        elementTypes: Array.from(form.elementTypes),
        overpassFilters: form.overpassFilters
          .filter((f) => f.key.trim())
          .map((f) => ({ key: f.key.trim(), value: f.value.trim() || undefined })),
        include: linesToArray(form.include),
        exclude: linesToArray(form.exclude),
        searchPhrases: linesToArray(form.searchPhrases),
        extractFields: linesToArray(form.extractFields),
      };

      const url = editingId === "new" ? "/api/categories" : `/api/categories/${editingId}`;
      const method = editingId === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : "Failed to save");

      await load();
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        <Link href="/" className="text-blue-600 underline">
          ← Back to map
        </Link>
      </div>

      <p className="text-neutral-600">
        What the scan looks for. <strong>Only the OSM tag filters below actually run</strong> — a
        deterministic lookup against OpenStreetMap, same query every time, no AI involved. Include/exclude
        rules, search phrases, and extract fields are captured for a future AI-assisted verification pass
        that isn&apos;t built yet; saving them here doesn&apos;t filter anything today.
      </p>

      {editingId === null && (
        <>
          <button onClick={startNew} className="rounded bg-blue-600 text-white px-3 py-1.5">
            + New category
          </button>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-neutral-500">
                    {c.slug} · {c.overpassFilters.length} OSM tag filter
                    {c.overpassFilters.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button onClick={() => startEdit(c)} className="text-blue-600 underline">
                  Edit
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {editingId !== null && (
        <div className="space-y-5 border rounded p-4">
          <div>
            <label className="block font-medium mb-1">Slug</label>
            <input
              className="w-full border rounded px-2 py-1"
              value={form.slug}
              onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              placeholder="e.g. hikes"
              disabled={editingId !== "new"}
            />
            {editingId !== "new" && (
              <p className="text-xs text-neutral-500 mt-1">Slug can&apos;t be changed after creation.</p>
            )}
          </div>

          <div>
            <label className="block font-medium mb-1">Label</label>
            <input
              className="w-full border rounded px-2 py-1"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Hikes"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Description</label>
            <textarea
              className="w-full border rounded px-2 py-1"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="border-t pt-4">
            <h2 className="font-semibold text-emerald-700">Static lookup (live — actually runs)</h2>

            <div className="mt-2">
              <label className="block font-medium mb-1">OSM element types</label>
              <div className="flex gap-4">
                {ELEMENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={form.elementTypes.has(t)}
                      onChange={() => toggleElementType(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="block font-medium mb-1">
                OSM tag filters <span className="text-neutral-500 font-normal">(matches ANY row)</span>
              </label>
              {form.overpassFilters.map((row, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input
                    className="flex-1 border rounded px-2 py-1"
                    placeholder="key, e.g. natural"
                    value={row.key}
                    onChange={(e) => updateFilterRow(i, "key", e.target.value)}
                  />
                  <input
                    className="flex-1 border rounded px-2 py-1"
                    placeholder="value (optional), e.g. waterfall"
                    value={row.value}
                    onChange={(e) => updateFilterRow(i, "value", e.target.value)}
                  />
                  <button onClick={() => removeFilterRow(i)} className="text-red-500 px-2">
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={addFilterRow} className="text-blue-600 underline text-xs">
                + Add filter row
              </button>
            </div>
          </div>

          <div className="border-t pt-4">
            <h2 className="font-semibold text-neutral-500">
              AI-assisted (not active yet — saved for later)
            </h2>

            <div className="mt-2">
              <label className="block font-medium mb-1">Include rules (one per line)</label>
              <textarea
                className="w-full border rounded px-2 py-1"
                rows={2}
                value={form.include}
                onChange={(e) => setForm((p) => ({ ...p, include: e.target.value }))}
              />
            </div>
            <div className="mt-2">
              <label className="block font-medium mb-1">Exclude rules (one per line)</label>
              <textarea
                className="w-full border rounded px-2 py-1"
                rows={2}
                value={form.exclude}
                onChange={(e) => setForm((p) => ({ ...p, exclude: e.target.value }))}
              />
            </div>
            <div className="mt-2">
              <label className="block font-medium mb-1">Search phrases (one per line)</label>
              <textarea
                className="w-full border rounded px-2 py-1"
                rows={2}
                value={form.searchPhrases}
                onChange={(e) => setForm((p) => ({ ...p, searchPhrases: e.target.value }))}
                placeholder="cascada {place}"
              />
            </div>
            <div className="mt-2">
              <label className="block font-medium mb-1">Fields to extract (one per line)</label>
              <textarea
                className="w-full border rounded px-2 py-1"
                rows={2}
                value={form.extractFields}
                onChange={(e) => setForm((p) => ({ ...p, extractFields: e.target.value }))}
                placeholder="season"
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !form.slug.trim() || !form.label.trim()}
              className="rounded bg-blue-600 text-white px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={cancel} className="rounded border px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
