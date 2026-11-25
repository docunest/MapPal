// Use cases for the parent mode (words, letters, pairs, triples) and the games' content.
import {
  CLIP_KINDS, DIFFICULTIES, GAME_WEIGHT, KINDS, STATUSES, VOICES, canApprove, cleanText, grade, parseGradeOverride,
  suggestDifficulty, suggestSample, suggestStatus, syllabify, type Grade, type Kind, type Status,
} from "../domain/items";
import {
  addAudio, addImage, audioFor, contentVersion, createItem, ensureSeeded, findItem, firstTries, getItem, getMedia, imagesFor,
  listItems, putMedia, selectAudio, selectImage, updateItem, blockAudio, type ItemRow,
} from "../infrastructure/items";
import { AzureUnavailable, LETTER_IPA, azureConfigured, clipSsml, synthesize } from "../infrastructure/azure";
import { download, findPhotos, lookupAccent } from "../infrastructure/wiki";
import { BadRequest } from "../infrastructure/http";

const DAY = 86400000;

function asKind(v: unknown): Kind {
  if (typeof v === "string" && (KINDS as readonly string[]).includes(v)) return v as Kind;
  throw new BadRequest("kind must be word, letter, pair or triple");
}

// ---------------------------------------------------------------- grades and lesson counts from answers
type Stat = { tries: boolean[]; lessons: number };
async function statsByItem(items: ItemRow[]): Promise<Map<string, Stat>> {
  const rows = await firstTries(new Date(Date.now() - 365 * DAY));
  const byId = new Map(items.map((i) => [i.id, i]));
  // Older answers (before item ids) are matched by text: words by name (also "medis@first"), pairs by level 1.
  const byWord = new Map(items.filter((i) => i.kind === "word").map((i) => [i.text, i.id]));
  const byPair = new Map(items.filter((i) => i.kind === "pair").map((i) => [i.text, i.id]));
  const out = new Map<string, Stat>();
  for (const r of rows) {
    let id = r.itemId && byId.has(r.itemId) ? r.itemId : null;
    if (!id) id = r.level === 1 ? byPair.get(r.item) ?? null : byWord.get(r.item.split("@")[0]) ?? null;
    if (!id) continue;
    const s = out.get(id) ?? { tries: [], lessons: 0 };
    s.tries.push(r.correct); s.lessons++;
    out.set(id, s);
  }
  return out;
}

export type ListRow = {
  id: string; kind: Kind; text: string; accented: string; accentChecked: boolean; status: Status; difficulty: string;
  grade: Grade; gradeOverridden: boolean; lessons: number; suggest: Status | null; thumb: string | null; sample: string | null;
  needsBetterImage: boolean; notOk: boolean; approvable: boolean;
};

/** Parent list for one kind. Seeds an empty database on first use. */
export async function listForParent(kindRaw: unknown, origin: string): Promise<{ rows: ListRow[]; azure: boolean }> {
  const kind = asKind(kindRaw ?? "word");
  await ensureSeeded(origin);
  const all = await listItems();
  const items = all.filter((i) => i.kind === kind);
  const ids = items.map((i) => i.id).concat(items.map((i) => i.sampleItemId).filter((x): x is string => !!x));
  const [imgs, auds, stats] = await Promise.all([imagesFor(ids), audioFor(items.map((i) => i.id)), statsByItem(all)]);
  const words = new Map(all.filter((i) => i.kind === "word").map((i) => [i.id, i]));
  const rows = items.map((it): ListRow => {
    const st = stats.get(it.id) ?? { tries: [], lessons: 0 };
    const computed = grade(st.tries);
    const override = parseGradeOverride(it.gradeOverride);
    const g = it.gradeOverride ? override : computed;
    const photoOwner = it.kind === "word" ? it.id : it.sampleItemId;
    const thumb = imgs.find((m) => m.itemId === photoOwner && m.selected)?.mediaHash ?? null;
    const clip = auds.some((a) => a.itemId === it.id && a.selected && a.kind === CLIP_KINDS[it.kind as Kind][0]);
    return {
      id: it.id, kind: it.kind as Kind, text: it.text, accented: it.accented, accentChecked: it.accentChecked,
      status: it.status as Status, difficulty: it.difficulty, grade: g, gradeOverridden: !!it.gradeOverride,
      lessons: st.lessons, suggest: suggestStatus(it.status as Status, computed, st.tries.length), thumb,
      sample: it.sampleItemId ? words.get(it.sampleItemId)?.text ?? null : null,
      needsBetterImage: it.needsBetterImage, notOk: it.notOk,
      approvable: canApprove(it.kind as Kind, { image: !!thumb, clip, sample: !!it.sampleItemId }),
    };
  });
  return { rows, azure: azureConfigured() };
}

/** One item with every photo and clip, for the item screen. */
export async function itemDetail(id: string) {
  const it = await getItem(id);
  if (!it) throw new BadRequest("no such item");
  const all = await listItems("word");
  const photoOwner = it.kind === "word" ? it.id : it.sampleItemId;
  const [imgs, auds] = await Promise.all([photoOwner ? imagesFor([photoOwner]) : Promise.resolve([]), audioFor([it.id])]);
  return {
    item: it,
    images: imgs,
    audio: auds,
    clipKinds: CLIP_KINDS[it.kind as Kind],
    voices: [...VOICES, "offline", "parent"],
    words: all.filter((w) => !w.notOk).map((w) => ({ id: w.id, text: w.text })),
    sample: it.sampleItemId ? all.find((w) => w.id === it.sampleItemId)?.text ?? null : null,
    azure: azureConfigured(),
  };
}

/** Change fields, select a photo or clip, or approve. Only known fields with valid values are taken. */
export async function patchItem(id: string, body: Record<string, unknown>) {
  const it = await getItem(id);
  if (!it) throw new BadRequest("no such item");
  const data: Parameters<typeof updateItem>[1] = {};
  if (body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(String(body.status))) throw new BadRequest("bad status");
    data.status = String(body.status);
  }
  if (body.difficulty !== undefined) {
    if (!(DIFFICULTIES as readonly string[]).includes(String(body.difficulty))) throw new BadRequest("bad difficulty");
    data.difficulty = String(body.difficulty);
  }
  if (body.gradeOverride !== undefined) {
    const v = body.gradeOverride === null ? null : String(body.gradeOverride);
    if (v !== null && parseGradeOverride(v) === null) throw new BadRequest("grade must be 0-3, bomb or null");
    data.gradeOverride = v;
  }
  if (typeof body.needsBetterImage === "boolean") data.needsBetterImage = body.needsBetterImage;
  if (typeof body.notOk === "boolean") data.notOk = body.notOk;
  if (body.lettersMode === "sounds" || body.lettersMode === "names") data.lettersMode = body.lettersMode;
  if (typeof body.accented === "string" && body.accented.trim()) { data.accented = body.accented.trim().slice(0, 40); data.accentChecked = true; }
  if (typeof body.syllables === "string" && /^[^\s]+$/.test(body.syllables.trim())) data.syllables = body.syllables.trim().slice(0, 40);
  if (body.sampleItemId !== undefined) {
    if (body.sampleItemId === null) data.sampleItemId = null;
    else {
      const w = await getItem(String(body.sampleItemId));
      if (!w || w.kind !== "word") throw new BadRequest("sample must be a word");
      data.sampleItemId = w.id;
    }
  }
  if (Object.keys(data).length) await updateItem(id, data);
  if (typeof body.selectImage === "string") await selectImage(it.kind === "word" ? id : it.sampleItemId ?? id, body.selectImage);
  if (typeof body.selectAudio === "string") await selectAudio(id, body.selectAudio);
  const blk = body.blockAudio as { id?: unknown; blocked?: unknown } | undefined;
  if (blk && typeof blk.id === "string" && typeof blk.blocked === "boolean") await blockAudio(id, blk.id, blk.blocked);
  if (body.approve === true) {
    const d = await itemDetail(id);
    const clip = d.audio.some((a) => a.selected && a.kind === d.clipKinds[0]);
    const image = d.images.some((m) => m.selected);
    if (!canApprove(it.kind as Kind, { image, clip, sample: !!d.item.sampleItemId })) {
      throw new BadRequest(it.kind === "word" ? "Pasirink nuotrauką ir balsą" : "Pasirink balsą ir pavyzdinį žodį");
    }
    await updateItem(id, { status: "mokomes" });
  }
  return itemDetail(id);
}

/** New item → suggestions (stress, syllables, difficulty, sample, photos) and voices if Azure is set. */
export async function addItem(body: Record<string, unknown>, origin: string) {
  const kind = asKind(body.kind);
  const text = cleanText(body.text, kind);
  if (!text) throw new BadRequest("Neteisingas tekstas");
  await ensureSeeded(origin);
  const existing = await findItem(kind, text);
  if (existing) return itemDetail(existing.id);
  const accent = kind === "word" ? await lookupAccent(text) : null;
  const words = (await listItems("word")).filter((w) => !w.notOk);
  const sampleText = kind === "word" ? null : suggestSample(text, words.map((w) => w.text));
  const it = await createItem({
    kind, text, accented: accent ?? text, accentChecked: kind !== "word" || !!accent,
    syllables: kind === "word" ? syllabify(text) : text, difficulty: suggestDifficulty(text, kind),
    sampleItemId: sampleText ? words.find((w) => w.text === sampleText)?.id ?? null : null,
  });
  if (kind === "word") await searchPhotos(it.id, true);
  if (azureConfigured()) await generateMissing(it.id).catch(() => undefined);
  return itemDetail(it.id);
}

export async function searchPhotos(id: string, selectFirst = false) {
  const it = await getItem(id);
  if (!it || it.kind !== "word") throw new BadRequest("photos belong to words");
  const have = new Set((await imagesFor([id])).map((m) => m.title));
  const found = (await findPhotos(it.text)).filter((p) => !have.has(p.title)).slice(0, 6);
  let first = selectFirst && have.size === 0;
  for (const p of found) {
    try {
      const hash = await putMedia(await download(p.thumbUrl), "image/jpeg");
      await addImage(id, { mediaHash: hash, source: "commons", title: p.title, artist: p.artist, license: p.license,
        page: p.page, sourceUrl: p.thumbUrl, selected: first });
      first = false;
    } catch { /* skip a photo that won't download */ }
  }
  return itemDetail(id);
}

/** Photo from the phone (already made small on the phone), as base64 JPEG. */
export async function uploadPhoto(id: string, body: Record<string, unknown>) {
  const it = await getItem(id);
  if (!it || it.kind !== "word") throw new BadRequest("photos belong to words");
  const b64 = typeof body.jpeg === "string" ? body.jpeg.replace(/^data:image\/jpeg;base64,/, "") : "";
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 500 || bytes.length > 1_500_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new BadRequest("JPEG up to 1.5 MB expected");
  const hash = await putMedia(bytes, "image/jpeg");
  await addImage(id, { mediaHash: hash, source: body.camera ? "camera" : "upload", title: "Tėvų nuotrauka", selected: true });
  await updateItem(id, { needsBetterImage: false });
  return itemDetail(id);
}

/** Parent recording for one clip kind (from the phone's microphone). */
export async function uploadRecording(id: string, body: Record<string, unknown>) {
  const it = await getItem(id);
  if (!it) throw new BadRequest("no such item");
  const kind = String(body.kind ?? "");
  if (!CLIP_KINDS[it.kind as Kind].includes(kind)) throw new BadRequest("bad clip kind");
  const mime = String(body.mime ?? "").split(";")[0];
  if (!/^audio\/(webm|mp4|mpeg|ogg|wav|aac|x-m4a)$/.test(mime)) throw new BadRequest("audio type not supported");
  const bytes = Buffer.from(String(body.data ?? "").replace(/^data:[^,]+,/, ""), "base64");
  if (bytes.length < 200 || bytes.length > 2_000_000) throw new BadRequest("recording must be 0.2 KB to 2 MB");
  await addAudio(id, { kind, voice: "parent", mediaHash: await putMedia(bytes, mime), selected: true });
  return itemDetail(id);
}

/** Generates every Azure clip this item doesn't have yet (or `force` to redo after a stress change). */
export async function generateMissing(id: string, force = false) {
  const it = await getItem(id);
  if (!it) throw new BadRequest("no such item");
  if (!azureConfigured()) throw new AzureUnavailable("Azure raktas dar neįdėtas į Vercel");
  const have = await audioFor([id]);
  for (const kind of CLIP_KINDS[it.kind as Kind]) {
    for (const voice of VOICES) {
      if (!force && have.some((a) => a.kind === kind && a.voice === voice)) continue;
      const { inner, rate } = clipSsml(kind, it.accented, it.syllables, it.kind === "letter" ? LETTER_IPA[it.text] : undefined);
      const bytes = await synthesize(voice, inner, rate);
      await addAudio(id, { kind, voice, mediaHash: await putMedia(bytes, "audio/mpeg") });
    }
  }
  return itemDetail(id);
}

// ---------------------------------------------------------------- games
export type ContentItem = {
  id: string; kind: Kind; text: string; accented: string; syllables: string; status: Status; weight: number;
  difficulty: string; groups: string[]; phonogram: string | null; lettersMode: string; sample: string | null;
  image: string | null;
  /** Per clip kind: the parent's default first, then every other allowed voice (the child may switch). */
  audio: Record<string, { voice: string; hash: string }[]>;
};

/** Everything the games use: approved items with their chosen photo and clips. `v` unchanged → 304-like. */
export async function content(params: URLSearchParams, origin: string) {
  await ensureSeeded(origin);
  const version = await contentVersion();
  if (params.get("v") === String(version)) return { version, unchanged: true as const };
  const all = (await listItems()).filter((i) => !i.notOk);
  const live = all.filter((i) => GAME_WEIGHT[i.status as Status] > 0);
  const words = new Map(all.filter((i) => i.kind === "word").map((i) => [i.id, i]));
  const photoIds = live.map((i) => (i.kind === "word" ? i.id : i.sampleItemId)).filter((x): x is string => !!x);
  const [imgs, auds] = await Promise.all([imagesFor(photoIds), audioFor(live.map((i) => i.id))]);
  const items: ContentItem[] = live.map((i) => {
    const photoOwner = i.kind === "word" ? i.id : i.sampleItemId;
    const audio: ContentItem["audio"] = {};
    for (const a of auds) {
      if (a.itemId !== i.id || a.blocked) continue;
      const list = (audio[a.kind] ??= []);
      if (a.selected) list.unshift({ voice: a.voice, hash: a.mediaHash }); else list.push({ voice: a.voice, hash: a.mediaHash });
    }
    return {
      id: i.id, kind: i.kind as Kind, text: i.text, accented: i.accented, syllables: i.syllables, status: i.status as Status,
      weight: GAME_WEIGHT[i.status as Status], difficulty: i.difficulty, groups: i.groups, phonogram: i.phonogram,
      lettersMode: i.lettersMode, sample: i.sampleItemId ? words.get(i.sampleItemId)?.text ?? null : null,
      image: imgs.find((m) => m.itemId === photoOwner && m.selected)?.mediaHash ?? null, audio,
    };
  });
  return { version, unchanged: false as const, items };
}

export async function media(hash: string) {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  return getMedia(hash);
}
