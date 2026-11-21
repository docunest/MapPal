// start_run, next_batch, fetch_page, fetch_image, submit_reviews — the
// spending part of a run, every step counted against the caps.
import { imageTokens, textTokens, wouldBreak } from "../domain/caps";
import { digestText } from "../domain/digest";
import { reviewsSchema, type ReviewInput } from "../domain/review";
import { AGENT_CATEGORIES, type AgentCategory, type Candidate } from "../domain/types";
import { enrich } from "../infrastructure/enrich";
import { reviewsOf, saveReviews, updateRun } from "../infrastructure/repo";
import { fetchImage, fetchPage, type FetchedImage } from "../infrastructure/web";
import { assertSpending, capRun, loadRun, RunError, spentLine } from "./guard";

export interface AgentReply {
  text: string;
  images?: Array<{ before: string; image: FetchedImage }>;
}

export async function startRun(runId: unknown, ownerApproved: unknown): Promise<AgentReply> {
  const run = await loadRun(runId);
  if (ownerApproved !== true) throw new RunError("owner_approved must be true — only after the owner said yes to the dry run.");
  if (run.status !== "planned") throw new RunError(`Run is already ${run.status}.`);
  await updateRun(run.id, { status: "running", approvedAt: new Date() });
  const c = run.plan.categories;
  return {
    text: `Run ${run.id} started. Call next_batch with category "cafes" (${c.cafes.candidates.length} to check) and "exploration" (${c.exploration.candidates.length}), ${run.caps.batchSize} places per batch. Submit reviews after each batch.`,
  };
}

const CRITERIA: Record<AgentCategory, string> = {
  cafes:
    "Judge: real/fake/stale; keep only what the family likes — bar-style places, small hipster bars, genuinely local places families go to; NOT fancy restaurants or workers' after-shift pubs. Vibe from the photo + reviews. Note kitchen hours (Spanish kitchens close between lunch and dinner), peak times, risks. Menu/prices only for the best ones (fetch_page on their site or menu link).",
  exploration:
    "Judge: real/fake/stale; keep spots that make a real adventure or great photos (caves, mines, abandoned buildings, gorges). Check it still exists and is reachable (recent evidence), access open/restricted, where to park a camper, safety/legal notes.",
};

export async function nextBatch(runId: unknown, category: unknown): Promise<AgentReply> {
  const run = await loadRun(runId);
  assertSpending(run);
  if (!AGENT_CATEGORIES.includes(category as AgentCategory)) throw new RunError(`category must be one of ${AGENT_CATEGORIES.join(", ")}.`);
  const cat = category as AgentCategory;
  const plan = run.plan;
  const counters = run.counters;
  const caps = run.caps;
  const all = plan.categories[cat].candidates;
  const left = all.filter((c) => !c.served);
  if (!left.length) return { text: `All ${all.length} ${cat} candidates have been sent. ${spentLine(counters, caps)}` };
  if (counters.served[cat] >= caps[cat]) return { text: `${cat}: the ${caps[cat]} places this run may check have all been sent. ${spentLine(counters, caps)}` };

  const batch = left.slice(0, Math.min(caps.batchSize, caps[cat] - counters.served[cat]));
  // Lookups in parallel; each place gets a Google/photo/page allowance from what's left.
  let gd = caps.googleDetails - counters.googleDetails;
  let gp = caps.googlePhotos - counters.googlePhotos;
  let im = caps.images - counters.images;
  let pg = caps.pages - counters.pages;
  const allowances = batch.map(() => {
    const a = { googleDetails: gd-- > 0, googlePhotos: gp-- > 0, images: im-- > 0, pages: pg-- > 0 };
    return a;
  });
  const enriched = await Promise.all(batch.map((c, i) => enrich(c, allowances[i], plan.lang ?? "es")));

  const parts: Array<{ before: string; image?: FetchedImage }> = [];
  let capHit: Parameters<typeof capRun>[1] | null = null;
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    const e = enriched[i];
    // Google/page spend happened whether or not the place fits the token cap.
    counters.googleDetails += e.spent.googleDetails;
    counters.googlePhotos += e.spent.googlePhotos;
    counters.pages += e.spent.pages;
    const text = digestText(c, e.enrichment);
    const tt = textTokens(text);
    const it = e.image ? imageTokens(e.image.width, e.image.height) : 0;
    const broke = wouldBreak(counters, caps, { tokens: tt + it });
    if (broke) {
      capHit = broke;
      break;
    }
    counters.tokens += tt + it;
    counters.textTokens += tt;
    counters.imageTokens += it;
    if (e.image) counters.images += 1;
    counters.served[cat] += 1;
    const stored: Candidate = plan.categories[cat].candidates.find((x) => x.id === c.id)!;
    stored.served = true;
    stored.googlePlaceId = e.googlePlaceId;
    if (e.enrichment.photo && e.enrichment.photo.source !== "google") stored.photo = { source: e.enrichment.photo.source, page: e.enrichment.photo.page, credit: e.enrichment.photo.credit };
    parts.push({ before: text, image: e.image });
  }
  counters.batches += 1;
  await updateRun(run.id, { plan, counters });
  if (!parts.length && capHit) return { text: await capRun(run, capHit, counters) };

  const remaining = plan.categories[cat].candidates.filter((c) => !c.served).length;
  const header = `Batch ${counters.batches} · ${cat} ${parts.length} places (${remaining} left after this).\n${CRITERIA[cat]}`;
  const footer = [spentLine(counters, caps), capHit ? await capRun(run, capHit, counters) : "Next: submit_reviews for these, then next_batch again."].join("\n");
  const images: AgentReply["images"] = [];
  let pending = header;
  for (const p of parts) {
    pending += `\n\n${p.before}`;
    if (p.image) {
      images.push({ before: pending, image: p.image });
      pending = "";
    }
  }
  return { text: `${pending}\n\n${footer}`.trim(), images };
}

export async function fetchPageForAgent(runId: unknown, url: unknown): Promise<AgentReply> {
  const run = await loadRun(runId);
  assertSpending(run);
  if (typeof url !== "string") throw new RunError("url is required.");
  const counters = run.counters;
  if (wouldBreak(counters, run.caps, { pages: 1 })) return { text: await capRun(run, "pages", counters) };
  counters.pages += 1;
  let text: string;
  try {
    const p = await fetchPage(url, 8000);
    const lines = [
      `Page ${p.url}${p.title ? ` — ${p.title}` : ""}${p.truncated ? " (text cut at 8,000 characters)" : ""}`,
      p.text || "(no text)",
      p.menuLinks.length ? `Menu links: ${p.menuLinks.join(" ")}` : "",
      p.images.length ? `Images (fetch_image to look): ${p.images.slice(0, 8).map((i) => `${i.menu ? "[menu?] " : ""}${i.url}${i.alt ? ` "${i.alt}"` : ""}`).join(" · ")}` : "",
    ];
    text = lines.filter(Boolean).join("\n");
  } catch (err) {
    text = `Couldn't read ${url}: ${err instanceof Error ? err.message : String(err)}`;
  }
  const tt = textTokens(text);
  if (wouldBreak(counters, run.caps, { tokens: tt })) {
    return { text: await capRun(run, "tokens", counters) };
  }
  counters.tokens += tt;
  counters.textTokens += tt;
  await updateRun(run.id, { counters });
  return { text: `${text}\n\n${spentLine(counters, run.caps)}` };
}

export async function fetchImageForAgent(runId: unknown, url: unknown): Promise<AgentReply> {
  const run = await loadRun(runId);
  assertSpending(run);
  if (typeof url !== "string") throw new RunError("url is required.");
  const counters = run.counters;
  if (wouldBreak(counters, run.caps, { images: 1, tokens: 1 })) return { text: await capRun(run, wouldBreak(counters, run.caps, { images: 1, tokens: 1 })!, counters) };
  let image: FetchedImage;
  try {
    image = await fetchImage(url);
  } catch (err) {
    return { text: `Couldn't load ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }
  const it = imageTokens(image.width, image.height);
  if (wouldBreak(counters, run.caps, { tokens: it })) return { text: await capRun(run, "tokens", counters) };
  counters.images += 1;
  counters.tokens += it;
  counters.imageTokens += it;
  await updateRun(run.id, { counters });
  return { text: spentLine(counters, run.caps), images: [{ before: `Image ${url} (${image.width ?? "?"}×${image.height ?? "?"}, ~${it} tokens)`, image }] };
}

export async function submitReviews(runId: unknown, reviews: unknown, agent: string): Promise<AgentReply> {
  const run = await loadRun(runId);
  if (run.status === "planned" || run.status === "cancelled") throw new RunError(`Run is ${run.status}.`);
  const parsed = reviewsSchema.safeParse(reviews);
  if (!parsed.success) throw new RunError(`Reviews don't match the format: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const byId = new Map(AGENT_CATEGORIES.flatMap((cat) => run.plan.categories[cat].candidates.map((c) => [c.id, c] as const)));
  const bad = parsed.data.filter((r) => !byId.get(r.candidate)?.served).map((r) => r.candidate);
  if (bad.length) throw new RunError(`Not sent to you in this run: ${bad.join(", ")}. Review only places from next_batch.`);
  await saveReviews(
    run.id,
    agent,
    parsed.data.map((r: ReviewInput) => {
      const c = byId.get(r.candidate)!;
      return { review: r, category: c.category, osmRef: c.osmRef, googlePlaceId: c.googlePlaceId, name: c.name, lat: c.lat, lng: c.lng, photo: c.photo };
    }),
  );
  const saved = await reviewsOf(run.id);
  const counters = { ...run.counters, reviews: saved.length, kept: saved.filter((r) => r.keep).length };
  await updateRun(run.id, { counters });
  const unreviewed = [...byId.values()].filter((c) => c.served && !saved.some((s) => s.candidate === c.id)).map((c) => c.id);
  return { text: `Saved ${parsed.data.length} reviews (run total ${saved.length}, kept ${counters.kept}).${unreviewed.length ? ` Sent but not reviewed yet: ${unreviewed.join(", ")}.` : ""}` };
}
