import { requireToken, Unauthorized } from "@/lib/grocery/auth";
import { updateProduct, type ProductPatch } from "@/lib/grocery/store";

export async function PATCH(req: Request, ctx: RouteContext<"/api/grocery/products/[id]">) {
  try {
    requireToken(req);
  } catch (err) {
    if (err instanceof Unauthorized) return Response.json({ error: "unauthorized" }, { status: 401 });
    throw err;
  }
  const { id } = await ctx.params;
  const patch = (await req.json().catch(() => ({}))) as ProductPatch;
  const p = await updateProduct(id, patch);
  return Response.json({ product: { id: p.id, name: p.name, aliases: p.aliases, categoryId: p.categoryId, kind: p.kind, hidden: p.hidden } });
}
