import { z } from "zod";

// Shared validation for creating/editing a category via the API. Matches
// prisma/schema.prisma's Category model's editable fields.
export const categoryInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, numbers, hyphens only"),
  label: z.string().min(1),
  description: z.string().min(1),
  elementTypes: z.array(z.enum(["node", "way", "relation"])).min(1),
  overpassFilters: z
    .array(z.object({ key: z.string().min(1), value: z.string().optional() }))
    .min(1),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  searchPhrases: z.array(z.string()).default([]),
  extractFields: z.array(z.string()).default([]),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
