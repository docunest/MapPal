// The versioned layers (mappal_rule, mappal_rule_version): charter, output
// format and one rule set per use case. Every save is a new numbered version
// with who/when/why and a hash; the old ones stay for analysis and restore.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_RULES, DEFAULTS_NOTE } from "../domain/defaults";
import { shortHash } from "../domain/hash";
import { nodeSchema, type Profile, type UseCaseNode } from "../domain/profile";
import { chainOf, resolveProfile, treeProblems, buildUseCaseTree, type TreeEntry } from "../domain/tree";

export class RuleError extends Error {}

export interface RuleView {
  slug: string;
  layer: string;
  title: string;
  version: number;
  body: string;
  config: UseCaseNode | null;
  hash: string;
  createdBy: string;
  note: string | null;
  createdAt: string;
}

let seeded = false;
/** First run: store the code defaults. Later: a rule still at a default version follows newer code defaults (as a new version); edited rules are left alone. */
export async function ensureRulesSeeded() {
  if (seeded) return;
  for (const r of DEFAULT_RULES) {
    const config = r.config ? nodeSchema.parse(r.config) : null;
    const hash = shortHash(r.body, config);
    const data = { body: r.body, config: (config ?? undefined) as Prisma.InputJsonValue | undefined, hash, createdBy: "default" };
    const existing = await prisma.rule.findUnique({ where: { slug: r.slug }, include: { versions: { select: { version: true, hash: true, createdBy: true } } } });
    try {
      if (!existing) {
        await prisma.rule.create({ data: { slug: r.slug, layer: r.layer, title: r.title, currentVersion: 1, versions: { create: { ...data, version: 1, note: "first version (from the code)" } } } });
        continue;
      }
      const cur = existing.versions.find((v) => v.version === existing.currentVersion);
      if (!cur || cur.createdBy !== "default" || cur.hash === hash) continue;
      const version = Math.max(...existing.versions.map((v) => v.version)) + 1;
      await prisma.$transaction([
        prisma.ruleVersion.create({ data: { ...data, version, note: DEFAULTS_NOTE, ruleId: existing.id } }),
        prisma.rule.update({ where: { id: existing.id }, data: { currentVersion: version, title: r.title } }),
      ]);
    } catch (e) {
      // Another server instance did the same a moment ago (unique slug / version) — fine.
      if (!/Unique constraint|P2002/.test(String(e))) throw e;
    }
  }
  seeded = true;
}

const view = (rule: { slug: string; layer: string; title: string }, v: { version: number; body: string; config: unknown; hash: string; createdBy: string; note: string | null; createdAt: Date }): RuleView => ({
  slug: rule.slug,
  layer: rule.layer,
  title: rule.title,
  version: v.version,
  body: v.body,
  config: (v.config as UseCaseNode | null) ?? null,
  hash: v.hash,
  createdBy: v.createdBy,
  note: v.note,
  createdAt: v.createdAt.toISOString(),
});

export async function listRules(): Promise<RuleView[]> {
  await ensureRulesSeeded();
  const rules = await prisma.rule.findMany({ orderBy: [{ layer: "asc" }, { slug: "asc" }], include: { versions: true } });
  return rules.map((r) => view(r, r.versions.find((v) => v.version === r.currentVersion)!));
}

export async function currentRule(slug: string): Promise<RuleView> {
  await ensureRulesSeeded();
  const r = await prisma.rule.findUnique({ where: { slug }, include: { versions: true } });
  if (!r) throw new RuleError(`No rule ${slug}. Known: ${(await prisma.rule.findMany({ select: { slug: true } })).map((x) => x.slug).join(", ")}`);
  return view(r, r.versions.find((v) => v.version === r.currentVersion)!);
}

export async function rulesForUseCases(): Promise<RuleView[]> {
  return (await listRules()).filter((r) => r.layer === "usecase");
}

export interface UseCaseTree {
  tree: TreeEntry<RuleView>[];
  /** The complete rules for a use case plus its chain (root first) — each node's text, version and hash go into the brief. */
  resolve(useCase: string): { profile: Profile; chain: RuleView[] };
}

/** Use case → "Food › Cool bars" (unknown keys stay as they are). */
export async function titlesOfUseCases(): Promise<Record<string, string>> {
  const { tree } = await loadUseCaseTree();
  return Object.fromEntries(tree.map((e) => [e.key, chainOf(tree, e.key).map((x) => x.title).join(" › ")]));
}

/** The current use cases as a tree (Food → Cafes …). */
export async function loadUseCaseTree(): Promise<UseCaseTree> {
  const tree = buildUseCaseTree(await rulesForUseCases());
  return {
    tree,
    resolve(useCase) {
      const chain = chainOf(tree, useCase).map((e) => e.item);
      if (!chain.length) throw new RuleError(`No use case ${useCase}. Known: ${tree.map((e) => e.key).join(", ")}`);
      return { profile: resolveProfile(chain), chain };
    },
  };
}

export async function ruleHistory(slug: string) {
  await ensureRulesSeeded();
  const r = await prisma.rule.findUnique({ where: { slug }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!r) throw new RuleError(`No rule ${slug}`);
  return { current: r.currentVersion, versions: r.versions.map((v) => view(r, v)) };
}

/** Save a new version (validated). Unchanged content → no new version. Use-case rules may be new (slug "usecase:<name>"). */
export async function saveRule(slug: string, input: { body?: string; config?: unknown; title?: string }, by: string, note: string): Promise<RuleView> {
  await ensureRulesSeeded();
  if (!note.trim()) throw new RuleError("note (why) is required");
  const existing = await prisma.rule.findUnique({ where: { slug }, include: { versions: true } });
  const cur = existing?.versions.find((v) => v.version === existing.currentVersion);
  const isUseCase = slug.startsWith("usecase:");
  if (!existing && !isUseCase) throw new RuleError(`No rule ${slug}; only new use cases ("usecase:<name>") can be added`);
  const body = (input.body ?? cur?.body ?? "").trim();
  if (!body) throw new RuleError("body (the text the agent reads) is required");
  let config: UseCaseNode | null = null;
  if (isUseCase) {
    const parsed = nodeSchema.safeParse(input.config ?? cur?.config);
    if (!parsed.success) throw new RuleError(`config doesn't match the use-case rules format: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    config = parsed.data as UseCaseNode;
    if (`usecase:${config.useCase}` !== slug) throw new RuleError(`config.useCase "${config.useCase}" must match the slug ${slug}`);
    for (const c of [...(config.select ?? []), ...(config.drop ?? []), ...(config.score ?? [])]) {
      for (const rx of [c.regex?.pattern, ...Object.values(c.match ?? {}).flat().filter((v) => v.startsWith("~")).map((v) => v.slice(1))]) {
        if (!rx) continue;
        try {
          new RegExp(rx, "i");
        } catch {
          throw new RuleError(`bad regex: ${rx}`);
        }
      }
    }
    // The tree must still work: parent exists, no loop, every use case that runs resolves, id prefixes unique.
    // Only problems this save would add count, so an older broken node doesn't block unrelated edits.
    const others = (await rulesForUseCases()).filter((r) => r.slug !== slug);
    const before = new Set(treeProblems(await rulesForUseCases()));
    const added = treeProblems([...others, { config }]).filter((p) => !before.has(p));
    if (added.length) throw new RuleError(`the use-case tree would break: ${added.join("; ")}`);
  }
  const hash = shortHash(body, config);
  if (cur && cur.hash === hash && (!input.title || input.title === existing!.title)) return view(existing!, cur);
  const version = (existing?.currentVersion ?? 0) + 1;
  const data = { version, body, config: (config ?? undefined) as Prisma.InputJsonValue | undefined, hash, createdBy: by.slice(0, 60), note: note.slice(0, 500) };
  if (!existing) {
    const r = await prisma.rule.create({ data: { slug, layer: "usecase", title: input.title ?? config!.title, currentVersion: 1, versions: { create: data } }, include: { versions: true } });
    return view(r, r.versions[0]);
  }
  const [, v] = await prisma.$transaction([
    prisma.rule.update({ where: { slug }, data: { currentVersion: version, ...(input.title ? { title: input.title } : {}) } }),
    prisma.ruleVersion.create({ data: { ...data, ruleId: existing.id } }),
  ]);
  return view({ ...existing, title: input.title ?? existing.title }, v);
}

/** Make an old version current again (as a new version, so history stays linear). */
export async function restoreRule(slug: string, version: number, by: string) {
  const h = await ruleHistory(slug);
  const old = h.versions.find((v) => v.version === version);
  if (!old) throw new RuleError(`No version ${version} of ${slug}`);
  return saveRule(slug, { body: old.body, config: old.config ?? undefined }, by, `restored version ${version}`);
}

export async function ruleVersion(slug: string, version: number) {
  const h = await ruleHistory(slug);
  return h.versions.find((v) => v.version === version) ?? null;
}
