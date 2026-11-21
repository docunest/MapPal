"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tokens } from "@/components/agent/Tokens";
import { chainOf, resolveProfile, treeProblems, buildUseCaseTree } from "@/lib/agent/domain/tree";

interface RuleView {
  slug: string;
  layer: string;
  title: string;
  version: number;
  body: string;
  config: Record<string, unknown> | null;
  hash: string;
  createdBy: string;
  note: string | null;
  createdAt: string;
}

const LAYER_LABEL: Record<string, string> = { charter: "1 · Charter", format: "2 · Output format" };
const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

/**
 * Config mode: every brief layer the agent reads — charter, output format,
 * one rule set per use case — with its version history. Saving makes a new
 * version (a note is required); any version can be restored. Agents change the
 * same rules through the connector; their versions show here as "agent:…".
 */
export function ConfigPanel({ voter }: { voter: string }) {
  const [rules, setRules] = useState<RuleView[]>([]);
  const [slug, setSlug] = useState("charter");
  const [draft, setDraft] = useState<{ title: string; body: string; config: string } | null>(null);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<{ current: number; versions: RuleView[] } | null>(null);
  const [viewing, setViewing] = useState<RuleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/agent/rules").then((r) => r.json());
    setRules(d.rules ?? []);
    return (d.rules ?? []) as RuleView[];
  }, []);

  const open = useCallback(
    async (s: string, list?: RuleView[]) => {
      const r = (list ?? rules).find((x) => x.slug === s);
      setSlug(s);
      setIsNew(false);
      setViewing(null);
      setError(null);
      setSaved(null);
      setNote("");
      if (!r) return;
      setDraft({ title: r.title, body: r.body, config: r.config ? JSON.stringify(r.config, null, 2) : "" });
      fetch(`/api/agent/rules/${encodeURIComponent(s)}`).then((x) => x.json()).then((h) => setHistory(h.versions ? h : null));
    },
    [rules],
  );

  useEffect(() => {
    // Opens the charter once the list has loaded (asynchronously, after the fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then((list) => open("charter", list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = rules.find((r) => r.slug === slug);
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    let config: unknown;
    if (draft.config.trim()) {
      try {
        config = JSON.parse(draft.config);
      } catch (e) {
        setError(`The rules JSON doesn't parse: ${e instanceof Error ? e.message : String(e)}`);
        setBusy(false);
        return;
      }
    }
    const res = await fetch(`/api/agent/rules/${encodeURIComponent(slug)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.body, config, title: draft.title, note, by: voter || "app" }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error ?? String(res.status));
    setSaved(`Saved as v${d.version} · ${d.hash}. The next preview uses it.`);
    const list = await load();
    await open(slug, list);
    setSaved(`Saved as v${d.version} · ${d.hash}. The next preview uses it.`);
  };

  const restore = async (v: number) => {
    const res = await fetch(`/api/agent/rules/${encodeURIComponent(slug)}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v, by: voter || "app" }) });
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? String(res.status));
    const list = await load();
    await open(slug, list);
    setSaved(`Restored v${v} as v${d.version}.`);
  };

  /** A new use case: top level (a copy of Exploration's settings to start from), or a sub-type that inherits everything from its parent. */
  const newUseCase = (parent?: string) => {
    const parentTitle = parent ? tree.find((e) => e.key === parent)?.title : null;
    const title = window.prompt(parent ? `Name of the new sub-type of ${parentTitle} (e.g. Kebab, Rooftop bars):` : "Name of the new use case (e.g. Groceries, Karting):")?.trim();
    if (!title) return;
    const name = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^(\d)/, "x$1");
    if (!name || tree.some((e) => e.key === name)) return setError(`A use case "${name}" already exists`);
    const used = new Set(rules.map((r) => (r.config as { idPrefix?: string } | null)?.idPrefix));
    const letters = name.replace(/[^a-z]/g, "");
    const prefix = [letters[0], letters.slice(0, 2), letters.slice(0, 3), `${letters[0]}x`, "xx"].find((p) => p && /^[a-z]{1,3}$/.test(p) && !used.has(p)) ?? "xx";
    let config: Record<string, unknown>;
    if (parent) {
      // Start from what the parent (or its first sub-type) selects — narrow it down from there.
      const p = tree.find((e) => e.key === parent);
      const template = [p, ...(p?.children ?? []).map((c) => tree.find((e) => e.key === c))].find((e) => e?.runs)?.item.config as { select?: unknown[] } | undefined;
      config = { useCase: name, title, parent, idPrefix: prefix, select: template?.select ?? [{ kind: name, match: { amenity: "CHANGE-ME" }, points: 1 }], drop: [], score: [] };
    } else {
      const base = rules.find((r) => r.slug === "usecase:exploration") ?? rules.find((r) => r.layer === "usecase");
      config = { ...(base?.config ?? {}), useCase: name, idPrefix: prefix, title };
      delete config.parent;
    }
    setSlug(`usecase:${name}`);
    setIsNew(true);
    setHistory(null);
    setViewing(null);
    setError(null);
    setSaved(null);
    setNote(parent ? `new sub-type of ${parentTitle}` : "new use case");
    setDraft({ title, body: `What the family wants from ${title}: …`, config: JSON.stringify(config, null, 2) });
  };

  const layers = ["charter", "format"];
  const tree = buildUseCaseTree(rules.filter((r) => r.layer === "usecase"));
  const openKey = slug.startsWith("usecase:") ? slug.slice(8) : null;
  // What this use case ends up with after inheriting (live, from the draft).
  const resolved = (() => {
    if (!openKey || !draft) return null;
    let cfg: unknown;
    try {
      cfg = JSON.parse(draft.config);
    } catch {
      return { error: "the JSON doesn't parse" };
    }
    const items = [...rules.filter((r) => r.layer === "usecase" && r.slug !== slug), { slug, config: cfg as Record<string, unknown> }];
    const t = buildUseCaseTree(items);
    const entry = t.find((e) => e.key === openKey);
    const problems = treeProblems(items).filter((p) => p.startsWith(`${openKey}:`));
    if (!entry) return { error: "config.useCase must match the name" };
    const chain = chainOf(t, openKey);
    if (!entry.runs) return { chain: chain.map((e) => e.title), group: entry.children.length, problems };
    try {
      const p = resolveProfile(chain.map((e) => e.item));
      const own = (cfg as { drop?: unknown[]; score?: unknown[] }) ?? {};
      return { chain: chain.map((e) => e.title), profile: p, inherited: { drop: p.drop.length - (own.drop?.length ?? 0), score: p.score.length - (own.score?.length ?? 0) }, problems };
    } catch {
      return { chain: chain.map((e) => e.title), problems: problems.length ? problems : ["something required is missing here and on the parents"] };
    }
  })();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 text-neutral-900 lg:flex-row">
      <aside className="space-y-3 lg:w-80 lg:shrink-0">
        {layers.map((l) => (
          <div key={l}>
            <div className="mb-1 text-xs font-medium text-neutral-500">{LAYER_LABEL[l]}</div>
            <div className="flex flex-wrap gap-1 lg:flex-col">
              {rules
                .filter((r) => r.layer === l)
                .map((r) => (
                  <button key={r.slug} type="button" onClick={() => open(r.slug)} className={`rounded-xl border px-3 py-2 text-left text-sm ${slug === r.slug && !isNew ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-[11px] opacity-70">
                      v{r.version} · {r.hash} · {r.createdBy}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        ))}
        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">4 · Use cases (sub-types inherit from their parent)</div>
          <div className="flex flex-col gap-1">
            {tree.map((e) => {
              const r = e.item as RuleView;
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => open(r.slug)}
                  style={{ marginLeft: e.depth * 18 }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${slug === r.slug && !isNew ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-900"}`}
                >
                  <div className="font-medium">
                    {e.depth > 0 && <span className="mr-1 opacity-60">↳</span>}
                    {r.title}
                    {!e.runs && <span className="ml-2 rounded bg-neutral-200 px-1.5 text-[10px] font-normal text-neutral-700">group · {e.children.length}</span>}
                  </div>
                  <div className="text-[11px] opacity-70">
                    v{r.version} · {r.hash} · {r.createdBy}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" onClick={() => newUseCase()} className="w-full rounded-xl border border-dashed border-neutral-400 bg-white px-3 py-2 text-sm text-neutral-800">
          + New use case
        </button>
        <p className="text-[11px] text-neutral-500">
          Layers 3 (location) and 5 (known places) are built from data — the location best guess and what was already judged — so they have no text to edit. See them on the{" "}
          <Link href="/agent/debug" className="underline">
            index &amp; location map
          </Link>
          .
        </p>
      </aside>

      <section className="min-w-0 flex-1 space-y-3">
        {draft && (
          <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-semibold">{isNew ? `New: ${slug}` : current?.title}</h2>
              {!isNew && current && (
                <span className="text-xs text-neutral-500">
                  v{current.version} · {current.hash} · {current.createdBy} · {when(current.createdAt)}
                  {current.note ? ` — ${current.note}` : ""}
                </span>
              )}
            </div>
            {slug.startsWith("usecase:") && (
              <label className="block text-sm">
                Title
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" />
              </label>
            )}
            <label className="block text-sm">
              {slug.startsWith("usecase:") ? "What the family wants (the agent reads this)" : "Text the agent reads"}
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={slug.startsWith("usecase:") ? 6 : 14} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            </label>
            {resolved && (
              <div className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-700">
                {"error" in resolved ? (
                  <span className="text-red-700">{resolved.error}</span>
                ) : (
                  <>
                    <div>
                      <b>{resolved.chain.join(" › ")}</b>
                      {"group" in resolved
                        ? ` — a group: it runs no brief itself; its text and drop/score rules go to its ${resolved.group} sub-type${resolved.group === 1 ? "" : "s"}. Filtering by it shows all of them.`
                        : ""}
                    </div>
                    {"profile" in resolved && resolved.profile && (
                      <div>
                        Runs with: {resolved.profile.area.kind === "towns" ? "town circles" : `${resolved.profile.area.km} km radius`} · {resolved.profile.pageSize} per page · id {resolved.profile.idPrefix}1… · {resolved.profile.select.length} kinds selected · {resolved.profile.drop.length} drop rules
                        {resolved.inherited.drop > 0 ? ` (${resolved.inherited.drop} from parents)` : ""} · {resolved.profile.score.length} score rules
                        {resolved.inherited.score > 0 ? ` (${resolved.inherited.score} from parents)` : ""}. Anything left out of the JSON comes from the parent.
                      </div>
                    )}
                    {resolved.problems.map((p) => (
                      <div key={p} className="text-red-700">
                        ⚠ {p}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            {openKey && !isNew && (
              <button type="button" onClick={() => newUseCase(openKey)} className="rounded-full border border-dashed border-neutral-400 bg-white px-3 py-1 text-sm text-neutral-800">
                + Sub-type of {current?.title}
              </button>
            )}
            {slug.startsWith("usecase:") && (
              <label className="block text-sm">
                Rules (JSON, applied without AI: which index places count, what is dropped and why, points for ranking, page size)
                <textarea value={draft.config} onChange={(e) => setDraft({ ...draft, config: e.target.value })} rows={18} spellCheck={false} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs" />
              </label>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this change? (required)" className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <button type="button" disabled={busy || !note.trim()} onClick={save} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40">
                {busy ? "Saving…" : "Save new version"}
              </button>
            </div>
            {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
            {saved && <p className="rounded bg-green-50 p-2 text-sm text-green-800">{saved}</p>}
          </div>
        )}

        {history && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <h3 className="mb-1 font-semibold">History</h3>
            <ul className="divide-y divide-neutral-100 text-sm">
              {history.versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center gap-2 py-1">
                  <span className={`font-mono ${v.version === history.current ? "font-bold" : ""}`}>v{v.version}</span>
                  <span className="text-xs text-neutral-500">
                    {v.hash} · {v.createdBy} · {when(v.createdAt)}
                  </span>
                  <span className="flex-1 text-xs">{v.note}</span>
                  <button type="button" onClick={() => setViewing(viewing?.version === v.version ? null : v)} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                    {viewing?.version === v.version ? "Hide" : "View"}
                  </button>
                  {v.version !== history.current && (
                    <button type="button" onClick={() => restore(v.version)} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {viewing && (
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs">
                {viewing.body}
                {viewing.config ? `\n\n${JSON.stringify(viewing.config, null, 2)}` : ""}
              </pre>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <h3 className="mb-2 font-semibold">Agent connector tokens</h3>
          <Tokens />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/agent/budget" className="rounded-full bg-neutral-100 px-3 py-1">
            Budget log →
          </Link>
          <Link href="/agent/runs" className="rounded-full bg-neutral-100 px-3 py-1">
            Pulls / runs →
          </Link>
          <Link href="/agent/debug" className="rounded-full bg-neutral-100 px-3 py-1">
            Index &amp; location map →
          </Link>
        </div>
      </section>
    </div>
  );
}
