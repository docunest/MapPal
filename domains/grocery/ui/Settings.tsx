"use client";
import { useEffect, useMemo, useState } from "react";
import { autocomplete, type CatalogItem } from "../domain/text";
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
      <Agents ctx={ctx} />
      <CatalogEditor ctx={ctx} />

      <section>
        <h3>🔗 {ctx.tr("links")}</h3>
        <CopyField ctx={ctx} label={ctx.tr("familyLink")} value={`${origin}/grocery?t=${token}`} />
        <p className="muted small">{ctx.tr("homeScreen")}</p>
      </section>

      <section>
        <h3>ℹ️ {ctx.tr("status")}</h3>
        <p className="small">Database: {health?.db ?? "…"}<br />AI: {health?.ai ?? "…"}</p>
        <AiBalance ctx={ctx} />
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
  // Search: best matches. Otherwise the whole catalog by section (aisle order).
  const groups = useMemo(() => {
    if (q.trim()) return [{ id: "search", items: autocomplete(q, ctx.catalog, 30).map((x) => x.item) }];
    return ctx.categories
      .map((c) => ({ id: c.id, items: ctx.catalog.filter((p) => p.categoryId === c.id).sort((a, b) => a.name.localeCompare(b.name, "lt")) }))
      .filter((g) => g.items.length);
  }, [q, ctx.catalog, ctx.categories]);
  return (
    <section>
      <button className="link" onClick={() => setOpen(!open)}><h3>{open ? "▾" : "▸"} 📚 {ctx.tr("catalog")} · {ctx.catalog.length}</h3></button>
      {open ? (
        <>
          <p className="muted small">{ctx.tr("catalogHint")}</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ctx.tr("search")} />
          {groups.map((g) => (
            <div key={g.id}>
              {g.id !== "search" ? <h4>{ctx.catEmoji(g.id)} {ctx.catName(g.id)} · {g.items.length}</h4> : null}
              <ul className="catalog">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <button className="rowbtn" onClick={() => setEdit(p)}>
                      <span className="emoji">{ctx.catEmoji(p.categoryId)}</span>
                      <span className="name">{p.name}</span>
                      {p.source === "ai" ? <span className="muted small" title={ctx.tr("byAi")}>✨</span> : null}
                      <span className="muted small">{[p.nameEn, ...p.aliases].filter(Boolean).slice(0, 3).join(", ")}</span>
                      {p.uses ? <span className="qty">{p.uses}×</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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

type Agent = { id: string; name: string; createdAt: string; createdBy: string | null; lastUsedAt: string | null; revokedAt: string | null };

const when = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "lt-LT", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** MCP connector links: one per assistant, named, revocable (hard rules §5). */
function Agents({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; url: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const load = () => call<{ agents: Agent[] }>("/api/grocery/agents").then((r) => setAgents(r.agents)).catch(() => {});
  useEffect(() => {
    if (open) void load();
  }, [open]);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await call<{ token: string; agent: Agent }>("/api/grocery/agents", { method: "POST", body: { name } });
      setFresh({ name: r.agent.name, url: `${origin}/api/grocery/mcp/${r.token}`, token: r.token });
      setName("");
      await load();
    } catch (err) {
      ctx.toast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (a: Agent) => {
    if (!confirm(ctx.tr("revokeConfirm", { x: a.name }))) return;
    await call(`/api/grocery/agents/${a.id}`, { method: "DELETE" }).catch(() => {});
    await load();
  };
  return (
    <section>
      <button className="link" onClick={() => setOpen(!open)}><h3>{open ? "▾" : "▸"} 🤖 {ctx.tr("agents")}</h3></button>
      {open ? (
        <>
          <p className="muted small">{ctx.tr("agentsHint")}</p>
          <CopyField ctx={ctx} label={ctx.tr("openApiUrl")} value={`${origin}/api/grocery/v1/openapi.json`} />
          <form className="row" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ctx.tr("agentName")} maxLength={40} />
            <button className="primary" type="submit" disabled={busy || !name.trim()}>{ctx.tr("createLink")}</button>
          </form>
          {fresh ? (
            <div className="fresh">
              <p className="small"><strong>{fresh.name}</strong> — {ctx.tr("newLinkOnce")}</p>
              <CopyField ctx={ctx} label={ctx.tr("mcpUrl")} value={fresh.url} />
              <CopyField ctx={ctx} label={ctx.tr("apiKey")} value={fresh.token} />
            </div>
          ) : null}
          <ul className="agents">
            {(agents ?? []).map((a) => (
              <li key={a.id} className={a.revokedAt ? "revoked" : ""}>
                <div>
                  <strong>{a.name}</strong>
                  <div className="muted small">
                    {ctx.tr("created", { t: when(a.createdAt, ctx.lang) })}
                    {a.createdBy && a.createdBy !== "setup" ? ` · ${a.createdBy}` : ""} ·{" "}
                    {a.revokedAt
                      ? `${ctx.tr("revoked")} ${when(a.revokedAt, ctx.lang)}`
                      : a.lastUsedAt
                        ? ctx.tr("lastUsed", { t: when(a.lastUsedAt, ctx.lang) })
                        : ctx.tr("neverUsed")}
                  </div>
                </div>
                {a.revokedAt ? null : (
                  <button className="small danger" onClick={() => revoke(a)}>{ctx.tr("revoke")}</button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

type AiStatus = {
  configured: boolean;
  model: string;
  balance: { available: boolean; currency: string | null; total: number | null; low: boolean; error: string | null } | null;
  today: { calls: number; cap: number };
  month: { calls: number; cap: number };
};

/** DeepSeek balance and this app's AI use against its caps. */
function AiBalance({ ctx }: { ctx: Ctx }) {
  const [s, setS] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      setS(await call<AiStatus>("/api/grocery/ai"));
    } catch {
      /* offline */
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    call<AiStatus>("/api/grocery/ai").then(setS).catch(() => {});
  }, []);
  const money = (b: NonNullable<AiStatus["balance"]>) =>
    b.total === null ? "?" : `${b.currency === "CNY" ? "¥" : "$"}${b.total.toFixed(2)}`;
  return (
    <div className="aibal">
      {!s ? (
        <p className="small muted">…</p>
      ) : !s.configured ? (
        <p className="small muted">{ctx.tr("aiOff")}</p>
      ) : (
        <>
          <p className={`small${s.balance?.low ? " warn" : ""}`}>
            💳 {ctx.tr("aiBalance")}: <strong>{s.balance ? (s.balance.error ? s.balance.error : money(s.balance)) : "?"}</strong>
            {s.balance?.low ? ` — ${ctx.tr("aiLow")}` : ""}
          </p>
          <p className="small muted">
            {ctx.tr("aiUse", { d: s.today.calls, dc: s.today.cap, m: s.month.calls, mc: s.month.cap })}
          </p>
        </>
      )}
      <button className="small" disabled={busy} onClick={() => void load()}>↻</button>
    </div>
  );
}
