import type { CategoryDef } from "./types";
import { waterfalls } from "./waterfalls";
import { factories } from "./factories";

export const categoryDefs: CategoryDef[] = [waterfalls, factories];

export const categoryBySlug: Record<string, CategoryDef> = Object.fromEntries(
  categoryDefs.map((c) => [c.slug, c]),
);

export type { CategoryDef };
