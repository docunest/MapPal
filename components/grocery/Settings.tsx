"use client";
import { useEffect, useMemo, useState } from "react";
import { autocomplete, type CatalogItem } from "@/lib/grocery/text";
import { call, LS, lsGet } from "./client";
import type { Ctx } from "./App";

export function Settings({ ctx }: { ctx: Ctx }) {
  const [health, setHealth] = useState<{ db: string; ai: string } | null>(null);
  useEffect(() => {
    fetch("/api/grocery/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);
  const token = lsGet(LS.token) ?? "";
  const origin = typeof location !== "undefined" ? location.origin : "";
  return (
    <div className="settings">
      <section>
        <h3>👤 {ctx.member}</h3>
        <div className="row">
          <button onClick={() => ctx.setMember(null)}>{ctx.tr("changeName")}</button>
          <span className="muted">{ctx.tr("language")}:</span>
          <button className={ctx.lang === "lt" ? "primary small" : "small"} onClick={() => ctx.setLang("lt")}>LT</button>
          <button className={ctx.lang === "en" ? "primary small" : "small"} onClick={() => ctx.setLang("en")}>EN</button>
        </div>
      </section>

      <AisleOrder ctx={ctx} />
      <CatalogEditor ctx={ctx} />

      <section>
        <h3>🔗 {ctx.tr("links")}</h3>
        <CopyField ctx={ctx} label={ctx.tr("familyLink")} value={`${origin}/grocery#t=${token}`} />
        <CopyField ctx={ctx} label={ctx.tr("mcpLink")} value={`${origin}/api/mcp/${token}`} />
        <p className="muted small">{ctx.tr("homeScreen")}</p>
      </section>

      <section>
        <h3>ℹ️ {ctx.tr("status")}</h3>
        <p className="small">Database: {health?.db ?? "…"}<br />AI: {health?.ai ?? "…"}</p>
      </section>
    </div>
  );
}

function CopyField({ ctx, label, value }: { ctx: Ctx; label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <label className="copy">
      {label}
      <div className="row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            } catch {
              /* select manually */
            }
          }}
        >
          {done ? ctx.tr("copied") : ctx.tr("copy")}
        </button>
      </div>
    </label>
  );
}

function AisleOrder({ ctx }: { ctx: Ctx }) {
  const [ids, setIds] = useState(() => ctx.categories.map((c) => c.id));
  const [open, setOpen] = useState(false);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setIds(next);
    void call("/api/grocery/categories/order", { method: "PUT", body: { ids: next } });
  };
  return (
    <section>
      <button className="link" onClick={() => setOpen(!open)}><h3>{open ? "▾" : "▸"} 🧭 {ctx.tr("aisleOrder")}</h3></button>
      {open ? (
        <>
          <p className="muted small">{ctx.tr("aisleHint")}</p>
          <ol className="aisle">
            {ids.map((id, i) => (
              <li key={id}>
                <span>{ctx.catEmoji(id)} {ctx.catName(id)}</span>
                <span className="row">
                  <button className="small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button className="small" onClick={() => move(i, 1)} disabled={i === ids.length - 1}>↓</button>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}

function CatalogEditor({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<CatalogItem | null>(null);
  const shown = useMemo(() => {
    if (q.trim()) return autocomplete(q, ctx.catalog, 30).map((s) => s.item);
    return ctx.catalog.slice().sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || a.name.localeCompare(b.name, "lt")).slice(0, 40);
  }, [q, ctx.catalog]);
  return (
    <section>
      <button className="link" onClick={() => setOpen(!open)}><h3>{open ? "▾" : "▸"} 📚 {ctx.tr("catalog")} · {ctx.catalog.length}</h3></button>
      {open ? (
        <>
          <p className="muted small">{ctx.tr("catalogHint")}</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ctx.tr("search")} />
          <ul className="catalog">
            {shown.map((p) => (
              <li key={p.id}>
                <button className="rowbtn" onClick={() => setEdit(p)}>
                  <span className="emoji">{ctx.catEmoji(p.categoryId)}</span>
                  <span className="name">{p.name}</span>
                  <span className="muted small">{[p.nameEn, ...p.aliases].filter(Boolean).slice(0, 3).join(", ")}</span>
                  {p.uses ? <span className="qty">{p.uses}×</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {edit ? <ProductSheet ctx={ctx} product={edit} onClose={() => setEdit(null)} /> : null}
    </section>
  );
}

function ProductSheet({ ctx, product, onClose }: { ctx: Ctx; product: CatalogItem; onClose: () => void }) {
  const [name, setName] = useState(product.name);
  const [nameEn, setNameEn] = useState(product.nameEn ?? "");
  const [aliases, setAliases] = useState(product.aliases.join(", "));
  const [cat, setCat] = useState(product.categoryId);
  const save = async (extra: Record<string, unknown> = {}) => {
    const kind = ctx.categories.find((c) => c.id === cat)?.kind;
    await call(`/api/grocery/products/${product.id}`, {
      method: "PATCH",
      body: { name, nameEn, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), categoryId: cat, kind, ...extra },
    });
    await ctx.refreshCatalog();
    onClose();
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{ctx.catEmoji(product.categoryId)} {product.name}</h3>
        <label>{ctx.tr("nameLt")}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{ctx.tr("nameEn")}<input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></label>
        <label>{ctx.tr("aliases")}<input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="milk, pieno, leche" /></label>
        <label>
          {ctx.tr("section")}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {ctx.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {ctx.catName(c.id)}</option>)}
          </select>
        </label>
        <div className="row between">
          <button className="danger" onClick={() => save({ hidden: true })}>{ctx.tr("hideProduct")}</button>
          <div className="row">
            <button onClick={onClose}>{ctx.tr("close")}</button>
            <button className="primary" onClick={() => save()}>{ctx.tr("save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
