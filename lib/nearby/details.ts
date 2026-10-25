// Details for one tapped place: every details-capable source answers in
// parallel (Wikipedia, Wikidata, Commons, YouTube, address, Google…), each
// block tagged with its source. Sources that fail or are capped are listed,
// not silently dropped.
import type { DetailBlock, PlaceRef, Source, SourceContext, SourceNote } from "../sources/types";
import { SourceCappedError } from "../sources/types";

// Reading order on screen.
const ORDER: Record<string, number> = {
  article: 0,
  concept: 1,
  rating: 2,
  "fuel-prices": 3,
  hours: 4,
  facts: 5,
  photos: 6,
  videos: 7,
  address: 8,
  "ai-text": 9,
};

export async function placeDetails(
  place: PlaceRef,
  sources: Source[],
  ctx: SourceContext,
): Promise<{ blocks: DetailBlock[]; notes: SourceNote[] }> {
  const notes: SourceNote[] = [];
  const results = await Promise.all(
    sources.map(async (s) => {
      try {
        const blocks = await Promise.race([
          s.details!(place, ctx),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 15000)),
        ]);
        notes.push({ source: s.meta.id, status: blocks.length ? "ok" : "empty", message: `${blocks.length} blocks` });
        return blocks;
      } catch (err) {
        notes.push({
          source: s.meta.id,
          status: err instanceof SourceCappedError ? "capped" : "failed",
          message: (err instanceof Error ? err.message : String(err)).slice(0, 200),
        });
        return [];
      }
    }),
  );
  const blocks = results.flat().sort((a, b) => (ORDER[a.section.kind] ?? 50) - (ORDER[b.section.kind] ?? 50));
  return { blocks, notes };
}
