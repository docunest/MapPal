import { suggestionContext } from "../infrastructure/repo";

/** "Dažniausiai perkate": due by the family's own rhythm (no AI). */
export async function suggestFromHistory() {
  const { due } = await suggestionContext();
  return { suggestions: due.suggestions, source: "history" as const };
}
