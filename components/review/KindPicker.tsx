"use client";

import { createContext, useContext } from "react";

/** One use case as the UI needs it (from buildUseCaseTree on /api/agent/rules). */
export interface KindNode {
  key: string;
  title: string;
  parent: string | null;
  depth: number;
  children: string[];
  runs: boolean;
}

/** Use case → "Food › Cool bars", for cards and lists. */
export const KindTitles = createContext<Record<string, string>>({});
export const useKindTitle = () => {
  const titles = useContext(KindTitles);
  return (key: string) => titles[key] ?? key;
};

export function kindPaths(tree: KindNode[]): Record<string, string> {
  const by = new Map(tree.map((n) => [n.key, n]));
  const out: Record<string, string> = {};
  for (const n of tree) {
    const parts: string[] = [];
    for (let c: KindNode | undefined = n; c; c = c.parent ? by.get(c.parent) : undefined) parts.unshift(c.title);
    out[n.key] = parts.join(" › ");
  }
  return out;
}

const ancestors = (by: Map<string, KindNode>, key: string) => {
  const out: string[] = [];
  for (let p = by.get(key)?.parent; p; p = by.get(p)?.parent) out.push(p);
  return out;
};
const descendants = (by: Map<string, KindNode>, key: string): string[] => (by.get(key)?.children ?? []).flatMap((c) => [c, ...descendants(by, c)]);

/**
 * Pick kinds along the tree: tap Food → only food places (all sub-types);
 * its sub-types appear underneath — tap Cool bars to narrow to bars. Tapping
 * a parent again widens. Several branches can be on at once.
 */
export function KindPicker({ tree, value, onChange, counts, compact }: { tree: KindNode[]; value: string[]; onChange: (v: string[]) => void; counts?: Record<string, number>; compact?: boolean }) {
  const by = new Map(tree.map((n) => [n.key, n]));
  const on = new Set(value);
  // Rows to show: the roots, then the children of every selected node or of a node on the way to one.
  const open = new Set<string>();
  for (const k of value) {
    open.add(k);
    for (const a of ancestors(by, k)) open.add(a);
  }
  const rows: KindNode[][] = [tree.filter((n) => n.depth === 0)];
  for (let d = 0; ; d++) {
    const next = tree.filter((n) => n.depth === d + 1 && n.parent && open.has(n.parent));
    if (!next.length) break;
    rows.push(next);
  }
  const toggle = (k: string) => {
    if (on.has(k)) return onChange(value.filter((x) => x !== k));
    const drop = new Set([...ancestors(by, k), ...descendants(by, k)]);
    onChange([...value.filter((x) => !drop.has(x)), k]);
  };
  const size = compact ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const chip = (active: boolean, partly: boolean) => `shrink-0 rounded-full border ${size} ${active ? "border-neutral-900 bg-neutral-900 text-white" : partly ? "border-neutral-900 bg-neutral-100 text-neutral-900" : "border-neutral-300 bg-white text-neutral-800"}`;
  const n = (k: string) => {
    if (!counts) return "";
    const c = [k, ...descendants(by, k)].reduce((s, x) => s + (counts[x] ?? 0), 0);
    return ` ${c}`;
  };
  return (
    <div className="space-y-1">
      {rows.map((row, i) => (
        <div key={i} className={`flex gap-1 ${compact ? "overflow-x-auto pb-0.5" : "flex-wrap"}`}>
          {i === 0 ? (
            <button type="button" onClick={() => onChange([])} className={chip(!value.length, false)}>
              All
            </button>
          ) : (
            <span className="shrink-0 self-center pl-1 text-xs text-neutral-500">{"›".repeat(i)}</span>
          )}
          {row.map((k) => (
            <button key={k.key} type="button" onClick={() => toggle(k.key)} className={chip(on.has(k.key), !on.has(k.key) && open.has(k.key))} title={k.runs ? undefined : "group: includes everything under it"}>
              {k.title}
              {n(k.key)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
