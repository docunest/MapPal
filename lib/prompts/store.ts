// Shared, versioned prompt templates (docs/PLAN.md §7b). One set for all
// users; every save is a new version recording who made it.
import { prisma } from "../db";
import { DEFAULT_TEMPLATES } from "./defaults";
import { unknownPlaceholders } from "./placeholders";

export async function ensurePromptsSeeded() {
  for (const t of DEFAULT_TEMPLATES) {
    const existing = await prisma.promptTemplate.findUnique({ where: { slug: t.slug }, select: { id: true } });
    if (existing) continue;
    await prisma.promptTemplate.create({
      data: { ...t, updatedBy: "default", versions: { create: { body: t.body, createdBy: "default", note: "Initial default" } } },
    });
  }
}

export async function listTemplates() {
  await ensurePromptsSeeded();
  return prisma.promptTemplate.findMany({
    orderBy: { slug: "asc" },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function getTemplate(slug: string) {
  await ensurePromptsSeeded();
  return prisma.promptTemplate.findUnique({ where: { slug } });
}

export class PromptValidationError extends Error {}

export async function saveTemplate(slug: string, body: string, by: string, note?: string) {
  const bad = unknownPlaceholders(body);
  if (bad.length) {
    throw new PromptValidationError(
      `Unknown placeholder(s): ${bad.map((b) => `{{${b}}}`).join(", ")}. Only place-level placeholders are allowed.`,
    );
  }
  if (!body.trim()) throw new PromptValidationError("Template can't be empty");
  await ensurePromptsSeeded();
  const t = await prisma.promptTemplate.findUnique({ where: { slug } });
  if (!t) throw new PromptValidationError(`No template "${slug}"`);
  return prisma.promptTemplate.update({
    where: { slug },
    data: { body, updatedBy: by, versions: { create: { body, createdBy: by, note } } },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function restoreVersion(slug: string, versionId: string, by: string) {
  const v = await prisma.promptVersion.findUnique({ where: { id: versionId }, include: { template: true } });
  if (!v || v.template.slug !== slug) throw new PromptValidationError("No such version");
  return saveTemplate(slug, v.body, by, `Restored version from ${v.createdAt.toISOString().slice(0, 16).replace("T", " ")}`);
}
