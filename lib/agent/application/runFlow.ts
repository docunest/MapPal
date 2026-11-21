// fetch_page, fetch_image, submit_results — the agent's extra spending in a
// pull and its verdicts, every step counted against the caps.
import { imageTokens, textTokens, wouldBreak } from "../domain/caps";
import { reviewsSchema, type ReviewInput } from "../domain/review";
import { logEvent } from "../infrastructure/events";
import { reviewsOf, saveReviews, updateRun } from "../infrastructure/repo";
import { fetchImage, fetchPage, type FetchedImage } from "../infrastructure/web";
import { assertSpending, capRun, loadRun, RunError, spentLine } from "./guard";

export interface AgentReply {
  text: string;
  images?: Array<{ before: string; image: FetchedImage }>;
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
  await logEvent(run.id, { kind: "page", summary: `page ${url.slice(0, 120)}: ${tt} tokens`, data: { url }, tokens: tt });
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
  await logEvent(run.id, { kind: "image", summary: `image ${url.slice(0, 120)}: ${it} tokens`, data: { url, width: image.width, height: image.height }, tokens: it });
  return { text: spentLine(counters, run.caps), images: [{ before: `Image ${url} (${image.width ?? "?"}×${image.height ?? "?"}, ~${it} tokens)`, image }] };
}

export async function submitReviews(runId: unknown, reviews: unknown, agent: string, briefId?: string): Promise<AgentReply> {
  const run = await loadRun(runId);
  if (run.status === "planned" || run.status === "cancelled") throw new RunError(`Run is ${run.status}.`);
  const parsed = reviewsSchema.safeParse(reviews);
  if (!parsed.success) throw new RunError(`Reviews don't match the format: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const byId = new Map(Object.values(run.plan.categories).flatMap((pc) => pc.candidates.map((c) => [c.id, c] as const)));
  const bad = parsed.data.filter((r) => !byId.get(r.candidate)?.served).map((r) => r.candidate);
  if (bad.length) throw new RunError(`Not sent to you in this pull: ${bad.join(", ")}. Judge only places from get_briefs.`);
  await saveReviews(
    run.id,
    agent,
    parsed.data.map((r: ReviewInput) => {
      const c = byId.get(r.candidate)!;
      return { review: r, category: c.category, osmRef: c.osmRef, googlePlaceId: c.googlePlaceId, name: c.name, lat: c.lat, lng: c.lng, photo: c.photo, briefId };
    }),
  );
  for (const r of parsed.data) {
    const c = byId.get(r.candidate)!;
    await logEvent(run.id, { kind: "review", summary: `${r.candidate} ${c.name}: ${r.verdict} ${Math.round(r.confidence * 100)} %, ${r.keep ? "kept" : "not kept"} (AI)`, data: { candidate: r.candidate, osmRef: c.osmRef, verdict: r.verdict, keep: r.keep, relevant: r.relevant }, lat: c.lat, lng: c.lng });
  }
  const saved = await reviewsOf(run.id);
  const counters = { ...run.counters, reviews: saved.length, kept: saved.filter((r) => r.keep).length };
  await updateRun(run.id, { counters });
  const unreviewed = [...byId.values()].filter((c) => c.served && !saved.some((s) => s.candidate === c.id)).map((c) => c.id);
  return { text: `Saved ${parsed.data.length} reviews (run total ${saved.length}, kept ${counters.kept}).${unreviewed.length ? ` Sent but not reviewed yet: ${unreviewed.join(", ")}.` : ""}` };
}
