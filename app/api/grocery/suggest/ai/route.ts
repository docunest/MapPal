import { api } from "@/lib/grocery/http";
import { suggestionContext } from "@/lib/grocery/store";
import { aiConfigured, deepseekChatJson } from "@/lib/grocery/llm/deepseek";
import { shortlistWithAi } from "@/lib/grocery/llm/ai";

export const POST = api(async () => {
  if (!aiConfigured()) return Response.json({ error: "AI is off (DEEPSEEK_API_KEY not set)" }, { status: 503 });
  const { history, products, state, categories } = await suggestionContext();
  const onList = new Set(state.entries.map((e) => e.productId));
  const staples = products.filter((p) => p.staple && !onList.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
  const r = await shortlistWithAi(
    { history, staples, listNames: state.entries.filter((e) => e.status === "OPEN").map((e) => e.name) },
    deepseekChatJson,
  );
  const byId = new Map(products.map((p) => [p.id, p]));
  const order = new Map(categories.map((c) => [c.id, c.sortOrder]));
  const items = r.items
    .filter((i) => !onList.has(i.productId))
    .map((i) => ({ ...i, name: byId.get(i.productId)!.name, categoryId: byId.get(i.productId)!.categoryId }))
    .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0));
  return { items, tips: r.tips, source: "ai" };
});
