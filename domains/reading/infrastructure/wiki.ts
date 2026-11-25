// Free lookups for a new word: stress from Wiktionary, photo suggestions from Wikipedia/Commons.
const UA = { "User-Agent": "mappal-reading/1.0 (family reading game)" };

async function json(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Accented form from the Lithuanian headword on en.wiktionary (e.g. "mẽdis"), or null. */
export async function lookupAccent(word: string): Promise<string | null> {
  try {
    const q = new URLSearchParams({ action: "query", format: "json", prop: "revisions", rvprop: "content", rvslots: "main", titles: word });
    const d = (await json(`https://en.wiktionary.org/w/api.php?${q}`)) as { query?: { pages?: Record<string, { revisions?: { slots?: { main?: { "*"?: string } } }[] }> } };
    const page = Object.values(d.query?.pages ?? {})[0];
    const text = page?.revisions?.[0]?.slots?.main?.["*"] ?? "";
    const lt = text.split(/\n==Lithuanian==/)[1]?.split(/\n==[^=]/)[0] ?? "";
    const head = lt.match(/\{\{(?:lt-noun|head\|lt\|noun)[^}]*?head=([^|}]+)/);
    return head ? head[1].trim() : null;
  } catch {
    return null;
  }
}

export type PhotoCandidate = { title: string; thumbUrl: string; page: string | null; license: string; artist: string };
const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim().slice(0, 140);

/** Lead photo of the Lithuanian Wikipedia article plus a few Commons search hits, with licences. */
export async function findPhotos(word: string, max = 6): Promise<PhotoCandidate[]> {
  const files: string[] = [];
  try {
    const q = new URLSearchParams({ action: "query", format: "json", prop: "pageimages", piprop: "name", redirects: "1", titles: word });
    const d = (await json(`https://lt.wikipedia.org/w/api.php?${q}`)) as { query?: { pages?: Record<string, { pageimage?: string }> } };
    for (const p of Object.values(d.query?.pages ?? {})) if (p.pageimage) files.push(`File:${p.pageimage}`);
  } catch { /* no article */ }
  try {
    const q = new URLSearchParams({ action: "query", format: "json", list: "search", srnamespace: "6", srlimit: String(max), srsearch: `${word} filetype:bitmap` });
    const d = (await json(`https://commons.wikimedia.org/w/api.php?${q}`)) as { query?: { search?: { title: string }[] } };
    for (const s of d.query?.search ?? []) if (!files.includes(s.title)) files.push(s.title);
  } catch { /* search down */ }
  if (!files.length) return [];
  const q = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "480", titles: files.slice(0, max).join("|") });
  const d = (await json(`https://commons.wikimedia.org/w/api.php?${q}`)) as { query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }> } };
  const out: PhotoCandidate[] = [];
  for (const p of Object.values(d.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl) continue;
    const md = ii.extmetadata ?? {};
    out.push({ title: p.title, thumbUrl: ii.thumburl, page: ii.descriptionurl ?? null,
      license: plain(md.LicenseShortName?.value ?? ""), artist: plain(md.Artist?.value ?? "") });
  }
  return out;
}

export async function download(url: string): Promise<Buffer> {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
