// Validator agent: merge and de-duplicate candidates, assign tiers, rate each
// place real / stale / unverified from map evidence (rules), and ask the AI
// about uncertain matches ("is this bazaar really a hardware store?").
// Stale and mislabelled places are dropped WITH the reason, never silently.
//
// v1 limits, stated in the run notes: no web search (free tier only — no
// search API), so "real" rests on OpenStreetMap evidence (chain brand, opening
// hours, contact details, recent edits/surveys). AI checks only judge whether
// a place matches the scenario, from its name and tags, and are labelled AI.
import { z } from "zod";
import type { AiClient } from "../ai/deepseek";
import { distanceMeters } from "../geo";
import { isGone } from "../nearby/utilityKinds";
import type { Candidate } from "./bottomUp";
import { normalize } from "./brands";
import type { EvidenceItem, MatchReason, PipelineNote, ResultItem, ScenarioConfig, Verdict } from "./types";

export interface AiCheck {
  match: "yes" | "no" | "unsure";
  reason: string;
  by: string;
  at: string;
  /** Name when checked — a renamed place is checked again. */
  name: string;
}

const DAY = 86400000;
const years = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / (365.25 * DAY) : Infinity);

const CHECK_DATE_KEYS = ["check_date", "survey:date", "check_date:opening_hours", "source:date"];

function freshest(c: Candidate): { date?: string; what: string } {
  let best: { date?: string; what: string } = { date: c.lastEdited, what: "last edited on OpenStreetMap" };
  for (const k of CHECK_DATE_KEYS) {
    const v = c.tags[k];
    if (v && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v) && (!best.date || v > best.date)) best = { date: v, what: `${k} (checked on the ground)` };
  }
  return best;
}

/**
 * Same place mapped twice (node + building outline, two nodes): same
 * name/brand within 150 m — or within 400 m for chain stores, whose node and
 * building outline can sit far apart on a big retail park.
 */
export function dedupe(cands: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const richness = (c: Candidate) => Object.keys(c.tags).length + (c.tags.opening_hours ? 10 : 0);
  const isChain = (c: Candidate) => c.matchedBy.some((m) => m.by === "brand");
  for (const c of cands) {
    const label = normalize(c.tags.brand ?? c.name);
    const dup = out.find(
      (o) =>
        o.key === c.key ||
        (normalize(o.tags.brand ?? o.name) === label && distanceMeters(o, c) < (isChain(o) && isChain(c) ? 400 : 150)),
    );
    if (!dup) {
      out.push({ ...c, matchedBy: [...c.matchedBy] });
      continue;
    }
    const keep = richness(c) > richness(dup) ? c : dup;
    const other = keep === c ? dup : c;
    const merged: Candidate = { ...keep, matchedBy: [...keep.matchedBy] };
    for (const m of other.matchedBy) if (!merged.matchedBy.some((x) => JSON.stringify(x) === JSON.stringify(m))) merged.matchedBy.push(m);
    out[out.indexOf(dup)] = merged;
  }
  return out;
}

export function tierFor(c: Candidate, config: ScenarioConfig): number {
  const brand = c.matchedBy.find((m): m is Extract<MatchReason, { by: "brand" }> => m.by === "brand");
  if (brand) return brand.tier;
  return config.tagTier[c.kind] ?? config.lastTier;
}

export function isUncertain(c: Candidate, config: ScenarioConfig): boolean {
  const tagMatch = c.matchedBy.some((m) => m.by === "tag");
  const brand = c.matchedBy.find((m): m is Extract<MatchReason, { by: "brand" }> => m.by === "brand");
  // A brand in the brand tag, or in the name of a shop with the right tag, is
  // sure. A brand word only in the name of some other shop ("Moda Día") isn't.
  if (brand && (brand.via === "brand-tag" || tagMatch)) return false;
  if (!tagMatch) return true; // only the name matched a keyword — could be anything
  return config.uncertainTags.includes(c.kind);
}

/** Map evidence → verdict. Pure, so tests can pin it down. */
export function ruleVerdict(c: Candidate, now: Date): { verdict: Verdict; evidence: EvidenceItem[] } {
  const ev: EvidenceItem[] = [];
  const osmUrl = `https://www.openstreetmap.org/${c.osmRef}`;
  const brand = c.matchedBy.find((m) => m.by === "brand");
  const hasHours = !!c.tags.opening_hours;
  const hasContact = !!(c.tags.website || c.tags["contact:website"] || c.tags.phone || c.tags["contact:phone"]);
  const fresh = freshest(c);
  const age = years(fresh.date, now);
  if (brand) ev.push({ source: "osm", text: `Chain store: ${brand.brand}`, url: osmUrl });
  if (hasHours) ev.push({ source: "osm", text: `Opening hours mapped: ${c.tags.opening_hours}`, url: osmUrl });
  if (hasContact) ev.push({ source: "osm", text: "Website or phone listed", url: osmUrl });
  if (fresh.date) ev.push({ source: "osm", text: `${fresh.what}: ${fresh.date}`, url: osmUrl });

  let verdict: Verdict;
  if ((brand && age <= 4) || (hasHours && hasContact && age <= 6) || age <= 2) verdict = "real";
  else if (age > 6 && !hasHours && !hasContact) verdict = "stale";
  else verdict = "unverified";
  ev.push({
    source: "rules",
    text:
      verdict === "real"
        ? "Rated real from map evidence (chain, hours/contact, recent edit)."
        : verdict === "stale"
          ? `Rated stale: no hours or contact and not touched for ${Math.floor(age)} years — may have closed.`
          : "Thin data: little map evidence either way — likely real, not verified.",
  });
  return { verdict, evidence: ev };
}

const AiAnswer = z.object({
  results: z.array(z.object({ id: z.string(), match: z.enum(["yes", "no", "unsure"]), reason: z.string().max(300) })),
});

const TAGS_FOR_AI = ["shop", "name", "brand", "operator", "description", "craft", "trade", "opening_hours", "addr:city", "website"];

export function aiCheckMessages(config: ScenarioConfig, prompt: string, batch: Candidate[]) {
  const system = `You check map entries for a travel app. For each place decide from its name and OpenStreetMap tags whether it is genuinely a "${config.categoryLabel}" as the family describes it.
Answer JSON only: {"results":[{"id":string,"match":"yes"|"no"|"unsure","reason":string}]}. "unsure" when the name and tags don't tell. Keep reasons under 20 words. Don't invent facts about the place.`;
  const places = batch.map((c) => ({
    id: c.osmRef,
    tags: Object.fromEntries(TAGS_FOR_AI.filter((k) => c.tags[k]).map((k) => [k, c.tags[k]])),
  }));
  const user = `What the family needs:\n${prompt}\n\nPlaces:\n${JSON.stringify(places)}`;
  return { system, user };
}

export interface ValidateInput {
  candidates: Candidate[];
  config: ScenarioConfig;
  prompt: string;
  scenarioSlug: string;
  center: { lat: number; lng: number };
  now: Date;
  ai: AiClient | null;
  /** AI checks already stored on the place (Poi.checks[slug]), by osmRef. */
  cachedChecks: Map<string, AiCheck>;
}

export interface ValidateOutput {
  items: ResultItem[];
  dropped: Array<{ key: string; name: string; reason: string; lat: number; lng: number }>;
  notes: PipelineNote[];
  newChecks: Map<string, AiCheck>;
  tokensIn: number;
  tokensOut: number;
}

const AI_BATCH = 40;
const AI_MAX_PER_RUN = 120;

export async function validate(input: ValidateInput): Promise<ValidateOutput> {
  const { config, now } = input;
  const notes: PipelineNote[] = [];
  const dropped: ValidateOutput["dropped"] = [];
  const newChecks = new Map<string, AiCheck>();
  let tokensIn = 0;
  let tokensOut = 0;

  const alive = input.candidates.filter((c) => {
    if (isGone(c.tags)) {
      dropped.push({ key: c.key, name: c.name, lat: c.lat, lng: c.lng, reason: "Marked closed/private/disused on OpenStreetMap" });
      return false;
    }
    return true;
  });
  const unique = dedupe(alive);

  // --- AI checks for uncertain matches (cached per place + scenario) ---
  const uncertain = unique.filter((c) => isUncertain(c, config));
  const checks = new Map<string, AiCheck>();
  const toAsk: Candidate[] = [];
  for (const c of uncertain) {
    const cached = input.cachedChecks.get(c.osmRef);
    if (cached && cached.name === c.name) checks.set(c.osmRef, cached);
    else toAsk.push(c);
  }
  if (toAsk.length && input.ai) {
    // Nearest first, so a capped run still checks what matters most.
    const ordered = [...toAsk].sort((a, b) => distanceMeters(input.center, a) - distanceMeters(input.center, b)).slice(0, AI_MAX_PER_RUN);
    let asked = 0;
    for (let i = 0; i < ordered.length; i += AI_BATCH) {
      const batch = ordered.slice(i, i + AI_BATCH);
      try {
        const { system, user } = aiCheckMessages(config, input.prompt, batch);
        const r = await input.ai.chatJson(system, user, { maxTokens: 2500 });
        tokensIn += r.tokensIn;
        tokensOut += r.tokensOut;
        const parsed = AiAnswer.parse(r.json);
        for (const a of parsed.results) {
          const c = batch.find((b) => b.osmRef === a.id);
          if (!c) continue;
          const check: AiCheck = { match: a.match, reason: a.reason, by: `ai:${r.model}`, at: now.toISOString(), name: c.name };
          checks.set(c.osmRef, check);
          newChecks.set(c.osmRef, check);
          asked++;
        }
      } catch (err) {
        notes.push({ step: "ai", status: "failed", message: `AI check failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}` });
        break;
      }
    }
    notes.push({ step: "ai", status: "ok", message: `AI checked ${asked} uncertain places (${uncertain.length - toAsk.length} from cache)` });
    if (toAsk.length > AI_MAX_PER_RUN) {
      notes.push({ step: "ai", status: "skipped", message: `${toAsk.length - AI_MAX_PER_RUN} farther uncertain places not checked this run` });
    }
  } else if (toAsk.length) {
    notes.push({ step: "ai", status: "skipped", message: `${toAsk.length} uncertain places not checked (AI off) — shown as unverified` });
  }

  // --- verdicts + snapshot ---
  const items: ResultItem[] = [];
  for (const c of unique) {
    const check = checks.get(c.osmRef);
    if (check?.match === "no") {
      dropped.push({ key: c.key, name: c.name, lat: c.lat, lng: c.lng, reason: `AI (${check.by.slice(3)}): not a ${config.categoryLabel} — ${check.reason}` });
      continue;
    }
    // A chain's name on a different kind of shop ("Carrefour Viajes" is a
    // travel agency) is not this scenario's place unless the AI says so.
    const brandOnOtherShop =
      !c.matchedBy.some((m) => m.by === "tag" || m.by === "keyword") && c.matchedBy.some((m) => m.by === "brand" && m.via === "name");
    if (brandOnOtherShop && check?.match !== "yes") {
      dropped.push({
        key: c.key,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        reason: `Chain name on a different kind of shop (${c.kind})${check ? ` — AI unsure: ${check.reason}` : " — not checked by AI"}`,
      });
      continue;
    }
    const { verdict: rv, evidence } = ruleVerdict(c, now);
    if (rv === "stale") {
      dropped.push({ key: c.key, name: c.name, lat: c.lat, lng: c.lng, reason: evidence[evidence.length - 1].text });
      continue;
    }
    let verdict = rv;
    let verdictByAi = false;
    if (isUncertain(c, config)) {
      if (check?.match === "yes") {
        evidence.push({ source: check.by, text: `AI: matches — ${check.reason}` });
        verdictByAi = true;
      } else {
        evidence.push({ source: check?.by ?? "rules", text: check ? `AI unsure — ${check.reason}` : "Uncertain match, not checked" });
        verdict = "unverified";
        verdictByAi = !!check;
      }
    }
    const tier = tierFor(c, config);
    items.push({
      key: c.key,
      name: c.name,
      brand: c.matchedBy.find((m): m is Extract<MatchReason, { by: "brand" }> => m.by === "brand")?.brand ?? c.tags.brand,
      lat: c.lat,
      lng: c.lng,
      kind: c.kind,
      tier,
      tierLabel: config.tierLabels[tier] ?? `Tier ${tier}`,
      big: config.bigTiers.includes(tier),
      openingHours: c.tags.opening_hours,
      address: c.address,
      phone: c.tags.phone ?? c.tags["contact:phone"],
      website: c.tags.website ?? c.tags["contact:website"],
      verdict,
      verdictByAi,
      evidence,
      matchedBy: c.matchedBy,
      lastEdited: c.lastEdited,
      sources: [
        { source: "osm", url: `https://www.openstreetmap.org/${c.osmRef}` },
        ...(verdictByAi && check ? [{ source: check.by }] : []),
      ],
    });
  }
  const counts = { real: 0, unverified: 0 };
  for (const i of items) if (i.verdict === "real") counts.real++; else counts.unverified++;
  notes.push({
    step: "validator",
    status: items.length ? "ok" : "empty",
    message: `${unique.length} unique of ${input.candidates.length} candidates → ${counts.real} real, ${counts.unverified} unverified, ${dropped.length} dropped. No web search in v1 (free tier) — verdicts rest on map evidence${input.ai ? " and AI checks of uncertain matches" : ""}.`,
  });
  return { items, dropped, notes, newChecks, tokensIn, tokensOut };
}
