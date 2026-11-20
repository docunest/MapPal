"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { autocomplete, fold, type CatalogItem } from "@/lib/grocery/text";
import { parseLocal, type ParsedItem } from "@/lib/grocery/parse";
import type { EntryDto } from "@/lib/grocery/store";
import type { DueSuggestion } from "@/lib/grocery/suggest";
import { call } from "./client";
import { groupByCategory, type Ctx, type NewItem } from "./App";

const isMulti = (s: string) => /[,;\n]/.test(s) || /\s(ir|and|bei|plus)\s/i.test(s) || s.trim().split(/\s+/).length >= 4;

function toNew(p: ParsedItem): NewItem {
  return {
    productId: p.productId,
    name: p.name,
    categoryId: p.categoryId ?? "kita",
    kind: p.kind ?? "GROCERY",
    qty: p.qty,
    note: p.note,
    nameEn: p.nameEn ?? null,
    aliases: p.aliases ?? [],
    action: p.action,
  };
}

const fromCatalog = (c: CatalogItem, qty?: string | null): NewItem => ({ productId: c.id, name: c.name, categoryId: c.categoryId, kind: c.kind, qty: qty ?? null });

export function Plan({ ctx }: { ctx: Ctx }) {
  const [editing, setEditing] = useState<EntryDto | null>(null);
  const grocery = ctx.entries.filter((e) => e.kind === "GROCERY");
  const later = ctx.entries.filter((e) => e.kind === "LONGTERM");
  return (
    <div className="plan">
      <AddBox ctx={ctx} />
      <Suggestions ctx={ctx} />
      {!ctx.entries.length ? <p className="empty">{ctx.tr("empty")}</p> : null}
      {grocery.length ? <ListSection ctx={ctx} title={`${ctx.tr("groceries")} · ${grocery.filter((e) => e.status === "OPEN").length}`} entries={grocery} onEdit={setEditing} /> : null}
      {later.length ? <ListSection ctx={ctx} title={`📦 ${ctx.tr("longTerm")} · ${later.length}`} entries={later} onEdit={setEditing} /> : null}
      {editing ? <EditSheet ctx={ctx} entry={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function AddBox({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState("");
  const [say, setSay] = useState(false);
  const [sayText, setSayText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const [preview, setPreview] = useState<{ items: ParsedItem[]; mode: string; aiOff: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openIds = useMemo(() => new Set(ctx.entries.filter((e) => e.status === "OPEN").map((e) => e.productId)), [ctx.entries]);
  const sugg = useMemo(() => autocomplete(q, ctx.catalog, 6), [q, ctx.catalog]);

  const pick = (c: CatalogItem) => {
    if (openIds.has(c.id)) ctx.toast(ctx.tr("already", { x: c.name }));
    else ctx.add([fromCatalog(c)], "pick");
    setQ("");
    inputRef.current?.focus();
  };

  const runParse = async (text: string) => {
    setBusy(true);
    try {
      const r = await call<{ mode: string; items: ParsedItem[]; aiAvailable?: boolean; aiError?: string }>("/api/grocery/parse", { method: "POST", body: { text } });
      const items = r.items;
      const aiOff = r.mode === "local" && (r.aiAvailable === false || !!r.aiError);
      if (!items.length) return;
      if ((r.mode === "local" && items.every((i) => !i.isNew)) || (items.length === 1 && r.mode === "local")) {
        ctx.add(items.map(toNew), "typed");
        if (aiOff && items.some((i) => i.isNew)) ctx.toast(ctx.tr("aiOff"));
      } else setPreview({ items, mode: r.mode, aiOff });
      setQ("");
      setSayText("");
      setSay(false);
    } catch {
      // No signal: do what the phone can on its own.
      const local = parseLocal(text, ctx.catalog);
      ctx.add(local.items.map(toNew), "typed");
      setQ("");
      setSayText("");
      setSay(false);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const text = q.trim();
    if (!text) return;
    if (isMulti(text)) return void runParse(text);
    const local = parseLocal(text, ctx.catalog);
    if (local.items.length && !local.unsure.length) {
      const fresh = local.items.filter((i) => !openIds.has(i.productId));
      if (fresh.length) ctx.add(fresh.map(toNew), "typed");
      else ctx.toast(ctx.tr("already", { x: local.items.map((i) => i.name).join(", ") }));
      setQ("");
      return;
    }
    const top = sugg[0];
    const f = fold(text);
    if (top && [top.item.name, top.item.nameEn ?? "", ...top.item.aliases].some((v) => fold(v).startsWith(f))) return pick(top.item);
    void runParse(text);
  };

  return (
    <section className="addbox">
      {!say ? (
        <form className="row" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            placeholder={ctx.tr("addPlaceholder")}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="done"
            disabled={busy}
          />
          <button type="button" className="say" onClick={() => setSay(true)} aria-label={ctx.tr("sayIt")}>🎤 {ctx.tr("sayIt")}</button>
        </form>
      ) : (
        <div className="saybox">
          <p className="muted">{ctx.tr("sayHint")}</p>
          <textarea autoFocus rows={4} value={sayText} onChange={(e) => setSayText(e.target.value)} disabled={busy} />
          <div className="row end">
            <button onClick={() => { setSay(false); setSayText(""); }}>{ctx.tr("cancel")}</button>
            <button className="primary" disabled={busy || !sayText.trim()} onClick={() => runParse(sayText)}>
              {busy ? ctx.tr("working") : `✨ ${ctx.tr("process")}`}
            </button>
          </div>
        </div>
      )}
      {busy && !say ? <p className="muted small">{ctx.tr("working")}</p> : null}
      {focus && q && sugg.length ? (
        <ul className="suggest">
          {sugg.map((s) => (
            <li key={s.item.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.item)}>
                <span className="emoji">{ctx.catEmoji(s.item.categoryId)}</span>
                <span className="name">{s.item.name}</span>
                {s.via ? <span className="muted small">{s.via}</span> : null}
                {openIds.has(s.item.id) ? <span className="ok">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {preview ? <PreviewSheet ctx={ctx} preview={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}

function PreviewSheet({ ctx, preview, onClose }: { ctx: Ctx; preview: { items: ParsedItem[]; mode: string; aiOff: boolean }; onClose: () => void }) {
  const [items, setItems] = useState(() => preview.items.map((i) => ({ ...i, on: true })));
  const n = items.filter((i) => i.on).length;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{ctx.tr("previewTitle")}</h3>
        <p className="muted small">{preview.mode === "ai" ? ctx.tr("previewAi") : ctx.tr("previewLocal")}</p>
        {preview.aiOff ? <p className="warn small">{ctx.tr("aiOff")}</p> : null}
        <ul className="preview">
          {items.map((it, idx) => (
            <li key={idx} className={it.on ? "" : "off"} onClick={() => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, on: !x.on } : x)))}>
              <span className="check">{it.on ? "☑" : "☐"}</span>
              <span className="emoji">{ctx.catEmoji(it.categoryId ?? "kita")}</span>
              <span className="name">
                {it.action === "remove" ? <s>{it.name}</s> : it.name}
                {it.qty ? <span className="qty">{it.qty}</span> : null}
                {it.note ? <span className="muted small"> · {it.note}</span> : null}
              </span>
              {it.action === "remove" ? <span className="tag red">{ctx.tr("removeIt")}</span> : it.isNew ? <span className="tag">{ctx.tr("newItem")}</span> : null}
              {it.kind === "LONGTERM" ? <span className="tag">📦</span> : null}
            </li>
          ))}
        </ul>
        <div className="row end">
          <button onClick={onClose}>{ctx.tr("cancel")}</button>
          <button
            className="primary"
            disabled={!n}
            onClick={() => {
              ctx.add(items.filter((i) => i.on).map(toNew), preview.mode === "ai" ? "ai" : "typed");
              onClose();
            }}
          >
            {ctx.tr("addN", { n })}
          </button>
        </div>
      </div>
    </div>
  );
}

type SuggestState = { items: (DueSuggestion | { productId: string; name: string; categoryId: string; reason: string })[]; tips: string[]; source: "history" | "ai" };

function Suggestions({ ctx }: { ctx: Ctx }) {
  const [state, setState] = useState<SuggestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const key = ctx.entries.map((e) => e.productId).sort().join(",");
  useEffect(() => {
    const h = setTimeout(() => {
      call<{ suggestions: DueSuggestion[] }>("/api/grocery/suggest")
        .then((r) => setState((s) => (s?.source === "ai" ? s : { items: r.suggestions, tips: [], source: "history" })))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(h);
  }, [key]);
  const onList = new Set(ctx.entries.map((e) => e.productId));
  const items = (state?.items ?? []).filter((s) => !onList.has(s.productId));
  const byId = new Map(ctx.catalog.map((c) => [c.id, c]));
  const askAi = async () => {
    setBusy(true);
    try {
      const r = await call<{ items: { productId: string; name: string; categoryId: string; reason: string }[]; tips: string[] }>("/api/grocery/suggest/ai", { method: "POST" });
      setState({ items: r.items, tips: r.tips, source: "ai" });
    } catch (err) {
      ctx.toast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const addOne = (s: SuggestState["items"][number]) => {
    const c = byId.get(s.productId);
    if (c) ctx.add([fromCatalog(c)], "suggest");
  };
  const reasonText = (s: SuggestState["items"][number]) => {
    if (state?.source === "ai") return (s as { reason: string }).reason;
    const d = s as DueSuggestion;
    if (d.reason === "due") return ctx.tr("everyDays", { n: d.intervalDays ?? 0, d: d.daysSince ?? 0 });
    if (d.reason === "often") return ctx.tr("boughtAgo", { d: d.daysSince ?? 0 });
    return ctx.tr("staple");
  };
  if (!state || (!items.length && !state.tips.length)) return null;
  const allStaples = state.source === "history" && items.every((i) => (i as DueSuggestion).reason === "staple");
  const groups = ctx.categories.map((c) => ({ c, xs: items.filter((i) => i.categoryId === c.id) })).filter((g) => g.xs.length);
  return (
    <section className="suggestions">
      <div className="row between">
        <button className="link" onClick={() => setOpen(!open)}>
          <h3>{open ? "▾" : "▸"} {allStaples ? ctx.tr("staples") : ctx.tr("usually")} · {items.length}</h3>
        </button>
        <div className="row">
          <button className="small" disabled={busy} onClick={askAi}>{busy ? ctx.tr("working") : ctx.tr("askAi")}</button>
          {items.length ? (
            <button className="small primary" onClick={() => {
              const list = items.map((s) => byId.get(s.productId)).filter((c): c is CatalogItem => !!c).map((c) => fromCatalog(c));
              ctx.add(list, "suggest");
            }}>
              {ctx.tr("addAll")}
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <>
          <p className="muted small">{state.source === "ai" ? `✨ ${ctx.tr("fromAi")}` : ctx.tr("fromHistory")}</p>
          {state.tips.map((tip, i) => <p key={i} className="tip">💡 {tip}</p>)}
          {groups.map(({ c, xs }) => (
            <div key={c.id} className="sgroup">
              <span className="emoji">{c.emoji}</span>
              <div className="chips">
                {xs.map((s) => (
                  <button key={s.productId} className="chip" onClick={() => addOne(s)} title={reasonText(s)}>
                    ＋ {s.name}
                    <span className="why">{reasonText(s)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}

function ListSection({ ctx, title, entries, onEdit }: { ctx: Ctx; title: string; entries: EntryDto[]; onEdit: (e: EntryDto) => void }) {
  const groups = groupByCategory(entries, ctx.categories);
  const aiProducts = new Set(ctx.catalog.filter((c) => c.source === "ai").map((c) => c.id));
  return (
    <section className="list">
      <h2>{title}</h2>
      {groups.map(({ cat, items }) => (
        <div key={cat.id} className="group">
          <h4>{cat.emoji} {ctx.catName(cat.id)}</h4>
          <ul>
            {items.map((e) => (
              <li key={e.id} className={e.status === "BOUGHT" ? "done" : ""}>
                <button className="rowbtn" onClick={() => onEdit(e)}>
                  <span className="name">{e.name}</span>
                  {e.qty ? <span className="qty">{e.qty}</span> : null}
                  {e.note ? <span className="muted small note">{e.note}</span> : null}
                  {e.via === "ai" || (e.productId && aiProducts.has(e.productId)) ? <span className="muted small" title={ctx.tr("byAi")}>✨</span> : null}
                  {e.addedBy && e.addedBy !== ctx.member ? <span className="who">{e.addedBy}</span> : null}
                </button>
                <button
                  className="x"
                  aria-label={ctx.tr("remove")}
                  onClick={() => {
                    ctx.patch(e.id, { status: "REMOVED" });
                    ctx.toast(`✕ ${e.name}`, () => ctx.add([{ productId: e.productId, name: e.name, categoryId: e.categoryId, kind: e.kind, qty: e.qty, note: e.note }], e.via));
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function EditSheet({ ctx, entry, onClose }: { ctx: Ctx; entry: EntryDto; onClose: () => void }) {
  const [qty, setQty] = useState(entry.qty ?? "");
  const [note, setNote] = useState(entry.note ?? "");
  const [cat, setCat] = useState(entry.categoryId);
  const [longTerm, setLongTerm] = useState(entry.kind === "LONGTERM");
  const save = () => {
    const patch: Parameters<Ctx["patch"]>[1] = {};
    if (qty !== (entry.qty ?? "")) patch.qty = qty || null;
    if (note !== (entry.note ?? "")) patch.note = note || null;
    if (cat !== entry.categoryId) patch.categoryId = cat;
    const kind = longTerm ? "LONGTERM" : "GROCERY";
    if (kind !== entry.kind) patch.kind = kind;
    if (Object.keys(patch).length) ctx.patch(entry.id, patch);
    onClose();
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{ctx.catEmoji(entry.categoryId)} {entry.name}</h3>
        {entry.addedBy ? <p className="muted small">{ctx.tr("addedBy")} {entry.addedBy}</p> : null}
        <label>{ctx.tr("qty")}<input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2, 1 kg…" maxLength={20} /></label>
        <label>{ctx.tr("note")}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></label>
        <label>
          {ctx.tr("section")}
          <select value={cat} onChange={(e) => { setCat(e.target.value); setLongTerm(ctx.categories.find((c) => c.id === e.target.value)?.kind === "LONGTERM"); }}>
            {ctx.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {ctx.catName(c.id)}</option>)}
          </select>
        </label>
        <label className="toggle"><input type="checkbox" checked={longTerm} onChange={(e) => setLongTerm(e.target.checked)} /> 📦 {ctx.tr("isLongTerm")}</label>
        <div className="row between">
          <button className="danger" onClick={() => { ctx.patch(entry.id, { status: "REMOVED" }); onClose(); }}>{ctx.tr("remove")}</button>
          <div className="row">
            <button onClick={onClose}>{ctx.tr("close")}</button>
            <button className="primary" onClick={save}>{ctx.tr("save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
