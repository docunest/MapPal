"use client";

// Parent mode: manage the words, letters, pairs and triples every reading game uses
// (domains/reading/DESIGN.md). Lithuanian, phone first, no emojis (drawn icons only).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Kind = "word" | "letter" | "pair" | "triple";
type Grade = 0 | 1 | 2 | 3 | "bomb" | null;
type Row = {
  id: string; kind: Kind; text: string; accented: string; accentChecked: boolean; status: string; difficulty: string;
  grade: Grade; gradeOverridden: boolean; lessons: number; suggest: string | null; thumb: string | null; sample: string | null;
  needsBetterImage: boolean; notOk: boolean; approvable: boolean;
};
type Img = { id: string; mediaHash: string; selected: boolean; source: string; title: string | null; artist: string | null; license: string | null };
type Clip = { id: string; kind: string; voice: string; mediaHash: string; selected: boolean; blocked: boolean };
type Detail = {
  item: { id: string; kind: Kind; text: string; accented: string; accentChecked: boolean; syllables: string; status: string; difficulty: string;
    gradeOverride: string | null; needsBetterImage: boolean; notOk: boolean; lettersMode: string; sampleItemId: string | null };
  images: Img[]; audio: Clip[]; clipKinds: string[]; voices: string[]; words: { id: string; text: string }[]; sample: string | null; azure: boolean;
};

const TABS: [Kind, string][] = [["word", "Žodžiai"], ["letter", "Raidės"], ["pair", "Poros"], ["triple", "Trejetai"]];
const STATUS: [string, string][] = [["naujas", "Naujas"], ["mokomes", "Mokomės"], ["extra", "Extra pamokos"], ["ismokta", "Išmokta"]];
const DIFF: [string, string][] = [["lengvas", "Lengvas"], ["vidutinis", "Vidutinis"], ["sunkus", "Sunkus"]];
const CLIP_LABEL: Record<string, string> = { word: "Žodis", syllables: "Skiemenimis", sound: "Garsas", name: "Pavadinimas" };
const VOICE_LABEL: Record<string, string> = { "azure-ona": "Ona", "azure-ona-hd": "Ona HD", "azure-leonas": "Leonas", offline: "Senas balsas", parent: "Mano įrašas" };
const VOICE_ORDER = ["azure-ona", "azure-ona-hd", "azure-leonas", "offline", "parent"];
const FILTERS: [string, string][] = [["all", "Visi"], ["naujas", "Naujas"], ["mokomes", "Mokomės"], ["extra", "Extra"], ["ismokta", "Išmokta"], ["notok", "Ne OK"], ["photo", "Reikia nuotraukos"]];
const SORTS: [string, string][] = [["status", "Pagal būseną"], ["grade", "Silpniausi pirmi"], ["lessons", "Daugiausia pamokų"], ["az", "A–Ž"]];
const media = (h: string) => `/api/reading/media/${h}`;
const C = { ink: "#1F2A30", muted: "#607D8B", line: "#E0E6EA", teal: "#26A69A", bg: "#FFFFFF", soft: "#F5F7F8", warn: "#B71C1C" };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
  return j as T;
}

// ---------------------------------------------------------------- icons (drawn, not emojis)
function Sun({ off }: { off?: boolean }) {
  const c = off ? "#CFD8DC" : "#FFB300";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="5" fill={c} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="2.5" x2="12" y2="5.5" stroke={c} strokeWidth="2" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}
/** Deliberately plain and grey: not a prize to collect. */
function Bomb() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="14" r="6" fill="#90A4AE" />
      <path d="M15 9 L17 7" stroke="#90A4AE" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function GradeIcons({ g }: { g: Grade }) {
  if (g === null) return <span style={{ color: C.muted, fontSize: 13 }}>–</span>;
  if (g === "bomb") return <Bomb />;
  return <span style={{ display: "inline-flex" }}>{[1, 2, 3].map((i) => <Sun key={i} off={i > g} />)}</span>;
}
function Play() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" fill="currentColor" /></svg>;
}

// ---------------------------------------------------------------- small UI parts
const btn = (active = false, extra: CSSProperties = {}): CSSProperties => ({
  minHeight: 44, padding: "8px 14px", fontSize: 16, borderRadius: 12, border: `1px solid ${active ? C.teal : "#B0BEC5"}`,
  background: active ? C.teal : C.bg, color: active ? "#fff" : C.ink, cursor: "pointer", ...extra,
});
const sel: CSSProperties = { minHeight: 40, fontSize: 15, borderRadius: 10, border: "1px solid #B0BEC5", padding: "4px 6px", background: C.bg, color: C.ink };
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 18, margin: "0 0 8px" }}>{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- the page
export function ManageWords() {
  const [kind, setKind] = useState<Kind>("word");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [azure, setAzure] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("status");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [busy, setBusy] = useState(false);

  // State is set only when the answer arrives (no synchronous setState inside the effect).
  const load = useCallback(() => {
    return call<{ rows: Row[]; azure: boolean }>(`/api/reading/items?kind=${kind}`)
      .then((d) => { setRows(d.rows); setAzure(d.azure); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    try { await call(`/api/reading/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function add() {
    if (!newText.trim()) return;
    setBusy(true); setError(null);
    try {
      const d = await call<Detail>("/api/reading/items", { method: "POST", body: JSON.stringify({ kind, text: newText }) });
      setNewText(""); load(); setOpenId(d.item.id);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const order = (r: Row) => ({ naujas: 0, extra: 1, mokomes: 2, ismokta: 3 } as Record<string, number>)[r.status] ?? 9;
  const gradeRank = (g: Grade) => (g === "bomb" ? -1 : g === null ? 9 : g);
  const shown = (rows ?? [])
    .filter((r) => filter === "all" ? !r.notOk : filter === "notok" ? r.notOk : filter === "photo" ? r.needsBetterImage || (r.kind === "word" && !r.thumb) : r.status === filter && !r.notOk)
    .sort((a, b) => sort === "az" ? a.text.localeCompare(b.text, "lt") : sort === "lessons" ? b.lessons - a.lessons
      : sort === "grade" ? gradeRank(a.grade) - gradeRank(b.grade) : order(a) - order(b) || a.text.localeCompare(b.text, "lt"));

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 12, fontFamily: "system-ui, sans-serif", color: C.ink, background: C.bg, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 24, margin: "6px 0 4px" }}>Skaitymas: žodžiai ir raidės</h1>
      <a href="/reading" style={{ display: "inline-block", marginBottom: 10, fontSize: 16, color: "#00796B" }}>← Suvestinė</a>
      <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(([k, label]) => <button key={k} style={btn(kind === k)} onClick={() => { setRows(null); setKind(k); setFilter("all"); }}>{label}</button>)}
      </nav>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
        {FILTERS.filter(([f]) => f !== "photo" || kind === "word").map(([f, label]) => (
          <button key={f} style={btn(filter === f, { minHeight: 36, padding: "4px 10px", fontSize: 14 })} onClick={() => setFilter(f)}>{label}</button>
        ))}
        <select style={sel} value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "8px 0 12px" }}>
        <input value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={kind === "word" ? "Naujas žodis" : kind === "letter" ? "Raidė" : kind === "pair" ? "Dvi raidės, pvz. ma" : "Trys raidės, pvz. kra"}
          style={{ flex: 1, minHeight: 44, fontSize: 17, padding: "0 12px", borderRadius: 12, border: "1px solid #B0BEC5" }} />
        <button style={btn(true)} onClick={add} disabled={busy}>{busy ? "Ieškau…" : "Pridėti"}</button>
      </div>
      {!azure && <p style={{ color: C.muted, fontSize: 14 }}>Azure balsai dar nepasiekiami serveryje; galima naudoti senus balsus ir savo įrašus.</p>}
      {error && <p style={{ color: C.warn, fontSize: 16 }}>Nepavyko: {error}</p>}
      {!rows && !error && <p>Kraunama… (pirmą kartą užtrunka iki minutės)</p>}
      {rows && !shown.length && <p style={{ color: C.muted }}>Čia nieko nėra. Pridėk naują viršuje.</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {shown.map((r) => (
          <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
            <button onClick={() => setOpenId(r.id)} aria-label={`Atidaryti ${r.text}`}
              style={{ width: 56, height: 56, flex: "0 0 56px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.soft, padding: 0, overflow: "hidden", cursor: "pointer" }}>
              {r.thumb ? <img src={media(r.thumb)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 22, fontWeight: 700 }}>{r.kind === "word" ? "?" : r.text}</span>}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button onClick={() => setOpenId(r.id)} style={{ background: "none", border: 0, padding: 0, fontSize: 20, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
                {r.text}
              </button>
              <span style={{ marginLeft: 8, color: C.muted, fontSize: 14 }}>
                {r.kind === "word" ? r.accented + (r.accentChecked ? "" : " (kirtis nepatikrintas)") : r.sample ? `kaip žodyje ${r.sample}` : "be pavyzdinio žodžio"}
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                <select style={sel} value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })}>
                  {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select style={sel} value={r.difficulty} onChange={(e) => patch(r.id, { difficulty: e.target.value })}>
                  {DIFF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <GradeIcons g={r.grade} />
                <span style={{ fontSize: 13, color: C.muted }}>{r.lessons} pamok.</span>
                {r.suggest && (
                  <button style={btn(false, { minHeight: 32, padding: "2px 8px", fontSize: 13, borderColor: C.teal, color: C.teal })}
                    onClick={() => patch(r.id, { status: r.suggest })}>siūlau: {STATUS.find(([v]) => v === r.suggest)?.[1]}</button>
                )}
                {r.needsBetterImage && <span style={{ fontSize: 13, color: "#E65100" }}>reikia geresnės nuotraukos</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {openId && <ItemScreen id={openId} onClose={() => { setOpenId(null); load(); }} />}
    </main>
  );
}

// ---------------------------------------------------------------- one item
function ItemScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);   // clip id playing now
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seqRef = useRef(0);
  const [accent, setAccent] = useState("");
  const [syl, setSyl] = useState("");
  const [rec, setRec] = useState<{ kind: string; r: MediaRecorder } | null>(null);

  const run = useCallback(async (label: string, f: () => Promise<Detail>) => {
    setBusy(label); setError(null);
    try { const x = await f(); setD(x); setAccent(x.item.accented); setSyl(x.item.syllables); }
    catch (e) { setError((e as Error).message); }
    setBusy(null);
  }, []);
  useEffect(() => {
    let alive = true;
    call<Detail>(`/api/reading/items/${id}`)
      .then((x) => { if (alive) { setD(x); setAccent(x.item.accented); setSyl(x.item.syllables); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const patch = (body: Record<string, unknown>) => run("Saugoma…", () => call<Detail>(`/api/reading/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }));

  function stop() { seqRef.current++; audioRef.current?.pause(); setPlaying(null); }
  function playList(clips: Clip[]) {
    stop();
    const token = ++seqRef.current;
    let i = 0;
    const next = () => {
      if (token !== seqRef.current || i >= clips.length) { if (token === seqRef.current) setPlaying(null); return; }
      const c = clips[i++];
      setPlaying(c.id);
      const a = new Audio(media(c.mediaHash));
      audioRef.current = a;
      a.onended = () => setTimeout(next, 350);
      a.onerror = () => next();
      a.play().catch(() => next());
    };
    next();
  }
  /** Tap a voice card: it is chosen and playback stops (owner's flow). */
  function choose(c: Clip) { stop(); patch({ selectAudio: c.id }); }

  async function startRecording(kind: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        const data = await blobToBase64(blob);
        run("Įkeliamas įrašas…", () => call<Detail>(`/api/reading/items/${id}/recording`, { method: "POST", body: JSON.stringify({ kind, mime: blob.type, data }) }));
      };
      r.start();
      setRec({ kind, r });
    } catch { setError("Nepavyko įjungti mikrofono"); }
  }
  function stopRecording() { rec?.r.stop(); setRec(null); }

  async function uploadPhoto(file: File | undefined, camera: boolean) {
    if (!file) return;
    const jpeg = await shrinkToJpeg(file, 480);
    run("Įkeliama nuotrauka…", () => call<Detail>(`/api/reading/items/${id}/photos`, { method: "POST", body: JSON.stringify({ jpeg, camera }) }));
  }

  if (!d) {
    return <Overlay onClose={onClose}><p>{error ? `Nepavyko: ${error}` : "Kraunama…"}</p></Overlay>;
  }
  const it = d.item;
  const isWord = it.kind === "word";
  const selectedImage = d.images.find((m) => m.selected);
  const firstClip = d.audio.find((a) => a.kind === d.clipKinds[0] && a.selected);
  const canApprove = isWord ? !!selectedImage && !!firstClip : !!firstClip && !!it.sampleItemId;
  const missingAzure = d.azure && d.clipKinds.some((k) => ["azure-ona", "azure-ona-hd", "azure-leonas"].some((v) => !d.audio.some((a) => a.kind === k && a.voice === v)));

  return (
    <Overlay onClose={() => { stop(); onClose(); }}>
      <h2 style={{ fontSize: 28, margin: "0 0 2px" }}>{it.text}</h2>
      <div style={{ color: C.muted }}>{isWord ? `${it.accented} · ${it.syllables}` : d.sample ? `kaip žodyje ${d.sample}` : "pasirink pavyzdinį žodį"}</div>
      {busy && <p style={{ color: C.muted }}>{busy}</p>}
      {error && <p style={{ color: C.warn }}>Nepavyko: {error}</p>}

      {isWord ? (
        <Section title="Nuotrauka">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {d.images.map((m) => (
              <button key={m.id} onClick={() => patch({ selectImage: m.id })} title={`${m.artist ?? ""} ${m.license ?? ""}`}
                style={{ aspectRatio: "1", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", background: C.soft,
                  border: m.selected ? `4px solid ${C.teal}` : `1px solid ${C.line}` }}>
                <img src={media(m.mediaHash)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <label style={btn()}>Įkelti<input type="file" accept="image/*" hidden onChange={(e) => uploadPhoto(e.target.files?.[0], false)} /></label>
            <label style={btn()}>Fotografuoti<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => uploadPhoto(e.target.files?.[0], true)} /></label>
            <button style={btn()} onClick={() => run("Ieškoma…", () => call<Detail>(`/api/reading/items/${id}/photos`, { method: "POST", body: JSON.stringify({ search: true }) }))}>Ieškoti daugiau</button>
            <button style={btn(it.needsBetterImage)} onClick={() => patch({ needsBetterImage: !it.needsBetterImage })}>Reikia geresnės</button>
          </div>
          {selectedImage && <p style={{ fontSize: 12, color: C.muted }}>{selectedImage.title} · {selectedImage.artist} · {selectedImage.license}</p>}
        </Section>
      ) : (
        <Section title="Pavyzdinis žodis">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {selectedImage && <img src={media(selectedImage.mediaHash)} alt="" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 10, background: C.soft }} />}
            <select style={sel} value={it.sampleItemId ?? ""} onChange={(e) => patch({ sampleItemId: e.target.value || null })}>
              <option value="">— nėra —</option>
              {d.words.map((w) => <option key={w.id} value={w.id}>{w.text}</option>)}
            </select>
          </div>
        </Section>
      )}

      <Section title="Balsas">
        {d.clipKinds.map((k) => {
          const clips = d.audio.filter((a) => a.kind === k).sort((a, b) => VOICE_ORDER.indexOf(a.voice) - VOICE_ORDER.indexOf(b.voice));
          const chosen = clips.find((c) => c.selected);
          return (
            <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <b style={{ fontSize: 16, marginRight: 4 }}>{CLIP_LABEL[k] ?? k}</b>
                <button style={btn(true)} onClick={() => playList(clips.filter((c) => !c.blocked))} disabled={!clips.length}><Play /> Groti visus</button>
                <button style={btn()} onClick={() => chosen && playList([chosen])} disabled={!chosen}>Pakartoti</button>
                {rec?.kind === k
                  ? <button style={btn(true, { background: C.warn, borderColor: C.warn })} onClick={stopRecording}>Baigti įrašą</button>
                  : <button style={btn()} onClick={() => startRecording(k)} disabled={!!rec}>Įrašyti savo</button>}
              </div>
              <p style={{ fontSize: 13, color: C.muted, margin: "0 0 6px" }}>Vaikas žaidime gali perjungti balsus pats; čia nustatai numatytą ir užblokuoji netinkamus.</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {clips.map((c) => (
                  <span key={c.id} style={{ display: "inline-flex", alignItems: "stretch" }}>
                    <button onClick={() => choose(c)} title="Padaryti numatytu"
                      style={{ minHeight: 52, minWidth: 96, padding: "6px 10px", borderRadius: "12px 0 0 12px", cursor: "pointer", fontSize: 15,
                        border: c.selected ? `3px solid ${C.teal}` : `1px solid #B0BEC5`, textDecoration: c.blocked ? "line-through" : "none",
                        background: playing === c.id ? "#FFF3C4" : C.bg, color: c.blocked ? C.muted : C.ink }}>
                      {VOICE_LABEL[c.voice] ?? c.voice}{c.selected ? " · numatytas" : ""}{playing === c.id ? " · groja" : ""}
                    </button>
                    <button onClick={() => { stop(); patch({ blockAudio: { id: c.id, blocked: !c.blocked } }); }}
                      style={{ minHeight: 52, padding: "0 10px", borderRadius: "0 12px 12px 0", border: "1px solid #B0BEC5", borderLeft: 0,
                        background: c.blocked ? C.warn : C.soft, color: c.blocked ? "#fff" : C.ink, cursor: "pointer", fontSize: 13 }}>
                      {c.blocked ? "užblokuota" : "blokuoti"}
                    </button>
                  </span>
                ))}
                {!clips.length && <span style={{ color: C.muted }}>Dar nėra įrašų.</span>}
              </div>
            </div>
          );
        })}
        {isWord && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span>Raidėmis žaidime:</span>
            <button style={btn(it.lettersMode === "sounds")} onClick={() => patch({ lettersMode: "sounds" })}>garsais</button>
            <button style={btn(it.lettersMode === "names")} onClick={() => patch({ lettersMode: "names" })}>pavadinimais</button>
          </div>
        )}
        {missingAzure && <button style={btn(false, { marginTop: 8 })} onClick={() => run("Generuojama…", () => call<Detail>(`/api/reading/items/${id}/generate`, { method: "POST", body: "{}" }))}>Sugeneruoti trūkstamus balsus</button>}
      </Section>

      <Section title="Žodis">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center" }}>
          {isWord && <>
            <span>Kirtis{it.accentChecked ? "" : " (nepatikrintas)"}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={accent} onChange={(e) => setAccent(e.target.value)} style={{ ...sel, flex: 1, fontSize: 18 }} />
              <button style={btn()} onClick={() => patch({ accented: accent })}>Išsaugoti</button>
              {d.azure && <button style={btn()} onClick={() => run("Generuojama…", async () => {
                await call(`/api/reading/items/${id}`, { method: "PATCH", body: JSON.stringify({ accented: accent, syllables: syl }) });
                return call<Detail>(`/api/reading/items/${id}/generate`, { method: "POST", body: JSON.stringify({ force: true }) });
              })}>Perkurti balsus</button>}
            </div>
            <span>Skiemenys</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={syl} onChange={(e) => setSyl(e.target.value)} style={{ ...sel, flex: 1, fontSize: 18 }} />
              <button style={btn()} onClick={() => patch({ syllables: syl })}>Išsaugoti</button>
            </div>
          </>}
          <span>Būsena</span>
          <select style={sel} value={it.status} onChange={(e) => patch({ status: e.target.value })}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <span>Sunkumas</span>
          <select style={sel} value={it.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>{DIFF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <span>Pažymys</span>
          <select style={sel} value={it.gradeOverride ?? ""} onChange={(e) => patch({ gradeOverride: e.target.value || null })}>
            <option value="">pagal atsakymus</option><option value="3">3 saulės</option><option value="2">2 saulės</option>
            <option value="1">1 saulė</option><option value="0">0</option><option value="bomb">bomba</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button style={btn(true, { opacity: canApprove ? 1 : 0.4 })} disabled={!canApprove} onClick={() => patch({ approve: true })}>Patvirtinti (į Mokomės)</button>
          <button style={btn(it.notOk, it.notOk ? { background: C.warn, borderColor: C.warn } : {})} onClick={() => patch({ notOk: !it.notOk })}>
            {it.notOk ? "Pažymėta: ne OK" : "Ne OK"}
          </button>
        </div>
        {!canApprove && <p style={{ fontSize: 13, color: C.muted }}>{isWord ? "Patvirtinimui reikia pasirinktos nuotraukos ir balso." : "Patvirtinimui reikia balso ir pavyzdinio žodžio."}</p>}
      </Section>
    </Overlay>
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 50, display: "flex", justifyContent: "center", overflow: "auto" }}>
      <div style={{ background: C.bg, width: "min(820px, 100%)", minHeight: "100%", padding: 14, position: "relative" }}>
        <button onClick={onClose} style={{ ...btn(), position: "sticky", top: 0, float: "right", zIndex: 1 }}>Uždaryti</button>
        {children}
      </div>
    </div>
  );
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
}
/** The phone shrinks the photo before upload (max 480 px, JPEG), so uploads stay small. */
async function shrinkToJpeg(file: File, max: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}
