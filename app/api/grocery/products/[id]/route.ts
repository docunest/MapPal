import { api, editProduct, type ProductPatch } from "@/domains/grocery";

export async function PATCH(req: Request, ctx: RouteContext<"/api/grocery/products/[id]">) {
  const { id } = await ctx.params;
  return api(async () => ({ product: await editProduct(id, (await req.json().catch(() => ({}))) as ProductPatch) }))(req);
}
