import { api } from "@/lib/grocery/http";
import { suggestionContext } from "@/lib/grocery/store";

export const GET = api(async () => {
  const { due } = await suggestionContext();
  return { suggestions: due.suggestions, source: "history" };
});
