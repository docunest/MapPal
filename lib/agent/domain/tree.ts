// The use-case tree: Food → Cafes, Cool bars, Restaurants, Fast food… Pure
// and deterministic, shared by the briefs, the review app's filter and the
// Config editor (it runs in the browser too, so no server imports here).
import { nodeSchema, profileSchema, type Cond, type Profile, type UseCaseNode } from "./profile";

/** Anything that carries a use-case node (a stored rule view, or the node itself). */
export interface HasNode {
  config: UseCaseNode | Record<string, unknown> | null;
}

export interface TreeEntry<T extends HasNode = HasNode> {
  key: string;
  title: string;
  parent: string | null;
  depth: number;
  children: string[];
  /** Has its own "select": runs briefs and owns places. Groups only pass text and rules down. */
  runs: boolean;
  item: T;
}

const nodeOf = (h: HasNode): UseCaseNode | null => {
  const p = nodeSchema.safeParse(h.config);
  return p.success ? (p.data as UseCaseNode) : null;
};

/** Depth-first order (parents before children, siblings by title), with depth for indenting. A missing parent makes a node a root. */
export function buildUseCaseTree<T extends HasNode>(items: T[]): TreeEntry<T>[] {
  const nodes = new Map<string, { node: UseCaseNode; item: T }>();
  for (const it of items) {
    const n = nodeOf(it);
    if (n && !nodes.has(n.useCase)) nodes.set(n.useCase, { node: n, item: it });
  }
  const parentOf = (k: string): string | null => {
    const p = nodes.get(k)?.node.parent;
    if (!p || !nodes.has(p)) return null;
    // A cycle (a → b → a) is broken at the node that closes it.
    const seen = new Set([k]);
    for (let cur: string | null = p; cur; cur = nodes.get(cur)?.node.parent ?? null) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      if (!nodes.has(cur)) break;
    }
    return p;
  };
  const kids = new Map<string | null, string[]>();
  for (const k of nodes.keys()) {
    const p = parentOf(k);
    kids.set(p, [...(kids.get(p) ?? []), k]);
  }
  const byTitle = (a: string, b: string) => nodes.get(a)!.node.title.localeCompare(nodes.get(b)!.node.title) || a.localeCompare(b);
  const out: TreeEntry<T>[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const k of [...(kids.get(parent) ?? [])].sort(byTitle)) {
      const { node, item } = nodes.get(k)!;
      out.push({ key: k, title: node.title, parent, depth, children: [...(kids.get(k) ?? [])].sort(byTitle), runs: (node.select?.length ?? 0) > 0, item });
      walk(k, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Root → … → the node itself. */
export function chainOf<T extends HasNode>(tree: TreeEntry<T>[], key: string): TreeEntry<T>[] {
  const by = new Map(tree.map((e) => [e.key, e]));
  const chain: TreeEntry<T>[] = [];
  for (let e = by.get(key); e; e = e.parent ? by.get(e.parent) : undefined) chain.unshift(e);
  return chain;
}

/** The keys and everything under them. Unknown keys stay as they are (old categories keep working). */
export function expand(tree: TreeEntry[], keys: string[]): Set<string> {
  const by = new Map(tree.map((e) => [e.key, e]));
  const out = new Set<string>();
  const add = (k: string) => {
    if (out.has(k)) return;
    out.add(k);
    for (const c of by.get(k)?.children ?? []) add(c);
  };
  for (const k of keys) add(k);
  return out;
}

export const rootOf = (tree: TreeEntry[], key: string) => chainOf(tree, key)[0]?.key ?? key;

/**
 * The complete rules for one use case: settings from the nearest node that
 * sets them, drop and score rules root first, select from the node itself.
 * Throws (zod) when something required is set nowhere on the chain.
 */
export function resolveProfile(chain: Array<HasNode | UseCaseNode>): Profile {
  const nodes = chain.map((c) => nodeSchema.parse("config" in c ? c.config : c));
  const leaf = nodes[nodes.length - 1];
  const merged: Record<string, unknown> = {};
  for (const n of nodes) for (const [k, v] of Object.entries(n)) if (v !== undefined && k !== "select" && k !== "drop" && k !== "score") merged[k] = v;
  merged.select = leaf.select;
  merged.drop = nodes.flatMap((n) => n.drop);
  merged.score = nodes.flatMap((n) => n.score);
  merged.criteria = nodes.map((n) => n.criteria).filter(Boolean).join("\n");
  return profileSchema.parse(merged);
}

/** What's wrong with a tree: unknown parents, cycles, a use case that can't resolve, two use cases with the same id prefix. */
export function treeProblems(items: HasNode[]): string[] {
  const problems: string[] = [];
  const nodes = items.map(nodeOf).filter((n): n is UseCaseNode => !!n);
  const keys = new Set(nodes.map((n) => n.useCase));
  for (const n of nodes) {
    if (n.parent && !keys.has(n.parent)) problems.push(`${n.useCase}: parent "${n.parent}" doesn't exist`);
    if (n.parent === n.useCase) problems.push(`${n.useCase}: can't be its own parent`);
  }
  const tree = buildUseCaseTree(items);
  for (const n of nodes) if (n.parent && keys.has(n.parent) && tree.find((e) => e.key === n.useCase)?.parent === null) problems.push(`${n.useCase}: parent chain loops back to itself`);
  const prefixes = new Map<string, string>();
  for (const e of tree) {
    if (!e.runs) continue;
    try {
      const p = resolveProfile(chainOf(tree, e.key).map((x) => x.item));
      const other = prefixes.get(p.idPrefix);
      if (other) problems.push(`${e.key}: id prefix "${p.idPrefix}" is already used by ${other}`);
      else prefixes.set(p.idPrefix, e.key);
    } catch (err) {
      const issues = (err as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues;
      problems.push(`${e.key}: ${issues ? issues.slice(0, 4).map((i) => `${i.path.join(".") || "config"} ${i.message}`).join("; ") : String(err)} (set it here or on a parent)`);
    }
  }
  return problems;
}

/**
 * What the sub-types under a use case select. A place goes to its most
 * specific use case: when Fast food runs and has a Kebab sub-type, kebab
 * shops are Kebab's, not Fast food's as well.
 */
export function selectsBelow(tree: TreeEntry[], key: string): Cond[] {
  const out: Cond[] = [];
  const by = new Map(tree.map((e) => [e.key, e]));
  const walk = (k: string) => {
    for (const c of by.get(k)?.children ?? []) {
      const n = nodeOf(by.get(c)!.item);
      if (n?.select?.length) out.push(...n.select);
      walk(c);
    }
  };
  walk(key);
  return out;
}
