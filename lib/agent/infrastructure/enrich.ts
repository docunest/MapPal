// Per-place lookups for a batch (design doc Phase 0 step 3, "cheap first"):
// Google Places when the key is set (capped, free tier), Wikipedia and
// Commons for exploration, the place's own website photo as a fallback.
// Every lookup is a source fact; none of it is AI.
import { prisma } from "@/lib/db";
import { googleAgentDetails, googlePhotoMedia } from "@/lib/sources/google";
import { envPresent } from "@/lib/env";
import { sourceContext } from "@/lib/sources/runtime";
import { SourceCappedError } from "@/lib/sources/types";
import { claimValues, commonsFilePage, commonsPhotosNear, commonsThumb, wikidataEntities, wikipediaArticle, type WikidataEntity } from "@/lib/wikimedia";
import { imageTokens } from "../domain/caps";
import type { Candidate } from "../domain/types";
import type { Enrichment } from "../domain/digest";
import { fetchImage, fetchPage, fromBytes, type FetchedImage } from "./web";

export const googleConfigured = () => envPresent("GOOGLE_MAPS_API_KEY");

export const MAX_WEBSITE_IMAGE_TOKENS = 900;

export interface Allowance {
  googleDetails: boolean;
  googlePhotos: boolean;
  images: boolean;
  pages: boolean;
}

export interface Enriched {
  enrichment: Enrichment;
  image?: FetchedImage;
  googlePlaceId?: string;
  spent: { googleDetails: number; googlePhotos: number; pages: number };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 120);

async function wikiFor(c: Candidate): Promise<{ wiki?: Enrichment["wiki"]; imageFile?: string; note?: string }> {
  let lang: string | undefined;
  let title: string | undefined;
  let imageFile: string | undefined;
  const wp = c.tags.wikipedia?.match(/^([a-z]{2,3}):(.+)$/);
  if (wp) [, lang, title] = wp;
  const qid = c.tags.wikidata;
  if (qid && /^Q\d+$/.test(qid)) {
    const ent: WikidataEntity | undefined = (await wikidataEntities([qid], "claims|sitelinks").catch(() => ({}) as Record<string, WikidataEntity>))[qid];
    const p18 = claimValues(ent, "P18")[0];
    if (typeof p18 === "string") imageFile = p18;
    if (!title && ent?.sitelinks) {
      for (const l of ["es", "pt", "ast", "gl", "ca", "eu", "en"]) {
        const s = ent.sitelinks[`${l}wiki`];
        if (s) { lang = l; title = s.title; break; }
      }
    }
  }
  if (!lang || !title) return { imageFile };
  const a = await wikipediaArticle(lang, title).catch(() => null);
  if (!a) return { imageFile, note: `Wikipedia ${lang}:${title} not readable` };
  return { wiki: { lang, title: a.title, url: a.url, lead: a.lead }, imageFile };
}

export async function enrich(c: Candidate, allow: Allowance, lang: string): Promise<Enriched> {
  const e: Enrichment = { notes: [] };
  const spent = { googleDetails: 0, googlePhotos: 0, pages: 0 };
  let image: FetchedImage | undefined;
  let googlePlaceId: string | undefined;
  let googlePhotoName: string | undefined;

  if (googleConfigured() && allow.googleDetails) {
    try {
      const g = await googleAgentDetails(c, sourceContext(), lang);
      spent.googleDetails = 1; // counted whenever tried (conservative: with no match only the free Text Search ran)
      if (g) {
        googlePlaceId = g.id;
        e.google = { id: g.id, mapsUri: g.mapsUri, rating: g.rating, ratingCount: g.ratingCount, priceLevel: g.priceLevel, businessStatus: g.businessStatus, openNow: g.openNow, hours: g.hours, summary: g.summary, flags: g.flags, reviews: g.reviews };
        googlePhotoName = g.photos[0]?.name;
      } else e.notes.push("Google: no match within 300 m");
    } catch (err) {
      e.notes.push(err instanceof SourceCappedError ? `Google capped: ${msg(err)}` : `Google failed: ${msg(err)}`);
    }
  }

  // Free facts (Wikipedia, the Commons/website photo link) are kept 30 days so the same brief reads the same.
  const cached = await prisma.placeFacts.findUnique({ where: { osmRef: c.osmRef } }).catch(() => null);
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < 30 * 86_400_000 ? (cached.facts as CachedFacts) : null;
  if (fresh) {
    if (fresh.wiki) e.wiki = fresh.wiki;
    if (fresh.photo && allow.images) {
      try {
        image = await fetchImage(fresh.photo.url);
        e.photo = { ...fresh.photo, width: image.width, height: image.height };
      } catch (err) {
        e.notes.push(`photo failed: ${msg(err)}`);
      }
    }
    for (const n of fresh.notes ?? []) e.notes.push(n);
    return { enrichment: e, image, googlePlaceId, spent };
  }

  if ((c.family ?? c.category) === "exploration" || c.tags.wikidata || c.tags.wikipedia) {
    const w = await wikiFor(c);
    if (w.wiki) e.wiki = w.wiki;
    if (w.note) e.notes.push(w.note);
    if (allow.images && w.imageFile) {
      try {
        image = await fetchImage(commonsThumb(w.imageFile, 480));
        e.photo = { source: "commons", credit: "Wikimedia Commons", page: commonsFilePage(w.imageFile), url: commonsThumb(w.imageFile, 640), width: image.width, height: image.height };
      } catch (err) {
        e.notes.push(`Commons photo failed: ${msg(err)}`);
      }
    }
    if (allow.images && !image) {
      const near = await commonsPhotosNear(c, 150, 3).catch(() => []);
      if (near[0]) {
        try {
          image = await fetchImage(commonsThumb(near[0].file, 480));
          e.photo = { source: "commons", credit: "Wikimedia Commons, geotagged within 150 m", page: near[0].page, url: commonsThumb(near[0].file, 640), width: image.width, height: image.height };
        } catch (err) {
          e.notes.push(`Commons photo failed: ${msg(err)}`);
        }
      }
    }
  }

  if (allow.images && !image && googlePhotoName && allow.googlePhotos) {
    try {
      const p = await googlePhotoMedia(googlePhotoName, sourceContext(), 480);
      spent.googlePhotos = 1;
      image = fromBytes(new Uint8Array(p.bytes), p.contentType.split(";")[0]);
      e.photo = { source: "google", credit: "Google Maps (shown to the agent, not stored)", width: image.width, height: image.height };
    } catch (err) {
      e.notes.push(`Google photo failed: ${msg(err)}`);
    }
  }

  // No Google: the cafe's own website (its og:image) — counts as a page.
  const site = c.tags.website ?? c.tags["contact:website"];
  if (allow.images && allow.pages && !image && !e.google && ((c.family ?? c.category) === "food" || c.category === "cafes") && site) {
    try {
      spent.pages = 1;
      const page = await fetchPage(site, 600);
      if (page.ogImage) {
        const img = await fetchImage(page.ogImage);
        // Website previews can be huge (a blank 2286×1330 PNG cost 1.5 k tokens in the first test run): skip those.
        const cost = imageTokens(img.width, img.height);
        if (cost <= MAX_WEBSITE_IMAGE_TOKENS) {
          image = img;
          e.photo = { source: "website", credit: page.title ?? new URL(page.url).hostname, page: page.url, url: page.ogImage, width: img.width, height: img.height };
        } else e.notes.push(`website photo skipped (too big, ~${cost} tokens)`);
      } else e.notes.push(`website ${new URL(page.url).hostname} has no preview photo`);
      if (page.menuLinks.length) e.notes.push(`menu links on its website: ${page.menuLinks.slice(0, 3).join(" ")}`);
    } catch (err) {
      e.notes.push(`website failed: ${msg(err)}`);
    }
  }
  // Remember the free facts (never Google's).
  const keep: CachedFacts = { wiki: e.wiki, photo: e.photo && e.photo.source !== "google" && e.photo.url ? { source: e.photo.source, url: e.photo.url, page: e.photo.page, credit: e.photo.credit } : undefined, notes: e.notes.filter((n) => /menu links|no preview photo|website photo skipped/.test(n)) };
  await prisma.placeFacts
    .upsert({ where: { osmRef: c.osmRef }, create: { osmRef: c.osmRef, facts: keep as object, fetchedAt: new Date() }, update: { facts: keep as object, fetchedAt: new Date() } })
    .catch(() => undefined);
  return { enrichment: e, image, googlePlaceId, spent };
}

interface CachedFacts {
  wiki?: Enrichment["wiki"];
  photo?: { source: "commons" | "website"; url: string; page?: string; credit?: string };
  notes?: string[];
}
