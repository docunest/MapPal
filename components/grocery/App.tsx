"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CatalogItem } from "@/lib/grocery/text";
import type { CategoryDto, EntryDto, EntryPatch } from "@/lib/grocery/store";
import { call, LS, lsGet, lsSet, uid } from "./client";
import { t, type Key, type Lang } from "./i18n";
import { useSync } from "./useSync";
import { Plan } from "./Plan";
import { Shop } from "./Shop";
import { Settings } from "./Settings";

export type NewItem = {
  productId: string | null;
  name: string;
  categoryId: string;
  kind: "GROCERY" | "LONGTERM";
  qty?: string | null;
  note?: string | null;
  nameEn?: string | null;
  aliases?: string[];
  action?: "add" | "remove";
};

export type Ctx = {
  lang: Lang;
  tr: (k: Key, v?: Record<string, string | number>) => string;
  member: string;
  entries: EntryDto[];
  categories: CategoryDto[];
  catalog: CatalogItem[];
  trip: { id: string; startedAt: string; startedBy: string | null } | null;
  add: (items: NewItem[], via: string) => void;
  patch: (id: string, patch: EntryPatch) => void;
  finish: () => void;
  toast: (msg: string, undo?: () => void) => void;
  catName: (id: string) => string;
  catEmoji: (id: string) => string;
  refreshCatalog: () => Promise<void>;
  setLang: (l: Lang) => void;
  setMember: (m: string | null) => void;
};

type Tab = "plan" | "shop" | "settings";

function readTokenFromUrl(): string | null {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  return hash.get("t") ?? new URLSearchParams(location.search).get("t");
}

function installManifest(token: string) {
  // The Home Screen app must start with the token (Safari and the installed
  // app don't share storage): manifest start_url carries it.
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = `/api/grocery/manifest?t=${encodeURIComponent(token)}`;
}

type Boot = { token: string | null; member: string | null; lang: Lang };

/** Token from the link (#t= or ?t=) or from this phone; read once in the browser. */
function readBoot(): Boot {
  const fromUrl = readTokenFromUrl();
  if (fromUrl) lsSet(LS.token, fromUrl);
  return { token: fromUrl ?? lsGet(LS.token), member: lsGet(LS.member), lang: lsGet(LS.lang) === "en" ? "en" : "lt" };
}

const noopSubscribe = () => () => {};

export function App() {
  // false while the server-rendered shell hydrates, true afterwards.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [boot] = useState<Boot | null>(() => (typeof window === "undefined" ? null : readBoot()));
  const [member, setMemberState] = useState<string | null>(boot?.member ?? null);
  const [lang, setLangState] = useState<Lang>(boot?.lang ?? "lt");
  const token = boot?.token ?? null;

  useEffect(() => {
    if (!token) return;
    // Keep the token in the address so "Add to Home Screen" also gets it.
    if (!location.hash.includes("t=")) history.replaceState(null, "", `/grocery#t=${encodeURIComponent(token)}`);
    else if (location.search) history.replaceState(null, "", `/grocery${location.hash}`);
    installManifest(token);
  }, [token]);

  if (!mounted || !boot) return <div className="splash">🛒</div>;
  const tr = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  if (!token) return <div className="gate"><div className="gate-card"><h1>🛒 Pirkiniai</h1><p>{tr("needLink")}</p></div></div>;
  if (!member) return <WhoAreYou lang={lang} onDone={(m) => { lsSet(LS.member, m); setMemberState(m); }} />;
  return (
    <Main
      lang={lang}
      member={member}
      setLang={(l) => { lsSet(LS.lang, l); setLangState(l); }}
      setMember={(m) => { lsSet(LS.member, m); setMemberState(m); }}
    />
  );
}

function WhoAreYou({ lang, onDone }: { lang: Lang; onDone: (m: string) => void }) {
  const [name, setName] = useState("");
  const [known, setKnown] = useState<string[]>([]);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    call<{ members: string[] }>("/api/grocery/members").then((r) => setKnown(r.members)).catch((e) => setBad(e?.status === 401));
  }, []);
  const go = async (n: string) => {
    const v = n.trim();
    if (!v) return;
    lsSet(LS.member, v);
    await call("/api/grocery/members", { method: "POST", body: { name: v } }).catch(() => {});
    onDone(v);
  };
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>🛒 Pirkiniai</h1>
        {bad ? <p className="warn">{t(lang, "badLink")}</p> : null}
        <h2>{t(lang, "whoAreYou")}</h2>
        <p className="muted">{t(lang, "whoHint")}</p>
        <div className="chips">
          {known.map((k) => (
            <button key={k} className="chip big" onClick={() => go(k)}>{k}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go(name); }} className="row">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t(lang, "yourName")} maxLength={40} />
          <button className="primary" type="submit">{t(lang, "go")}</button>
        </form>
      </div>
    </div>
  );
}

function Main({ lang, member, setLang, setMember }: { lang: Lang; member: string; setLang: (l: Lang) => void; setMember: (m: string | null) => void }) {
  const [tab, setTab] = useState<Tab>(() => (lsGet("grocery.tab") as Tab) || "plan");
  const sync = useSync({ fast: tab === "shop", member });
  const [toastState, setToastState] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const tr = useCallback((k: Key, v?: Record<string, string | number>) => t(lang, k, v), [lang]);

  useEffect(() => lsSet("grocery.tab", tab), [tab]);

  const categories = useMemo(() => sync.view?.categories ?? sync.catalog?.categories ?? [], [sync.view, sync.catalog]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const toast = useCallback((msg: string, undo?: () => void) => {
    const id = Date.now();
    setToastState({ msg, undo, id });
    setTimeout(() => setToastState((s) => (s?.id === id ? null : s)), undo ? 6000 : 3500);
  }, []);

  const { enqueue } = sync;
  const patch = useCallback<Ctx["patch"]>((id, p) => enqueue({ opId: uid(), type: "patch", id, patch: p }), [enqueue]);
  const add = useCallback<Ctx["add"]>(
    (items, via) => {
      if (!items.length) return;
      const withIds = items.map((i) => ({ ...i, id: uid(), productId: i.productId ?? null }));
      enqueue({ opId: uid(), type: "add", via, items: withIds });
      const names = withIds.filter((i) => i.action !== "remove").map((i) => i.name);
      if (names.length) {
        toast(tr("added", { x: names.join(", ") }), () => withIds.forEach((i) => patch(i.id, { status: "REMOVED" })));
      }
    },
    [enqueue, toast, tr, patch],
  );
  const finish = useCallback(() => enqueue({ opId: uid(), type: "finish" }), [enqueue]);

  const ctx: Ctx = {
    lang,
    tr,
    member,
    entries: sync.view?.entries ?? [],
    categories,
    catalog: sync.catalog?.products ?? [],
    trip: sync.view?.trip ?? null,
    add,
    patch,
    finish,
    toast,
    catName: (id) => {
      const c = catMap.get(id);
      return c ? (lang === "en" ? c.nameEn : c.nameLt) : id;
    },
    catEmoji: (id) => catMap.get(id)?.emoji ?? "🛒",
    refreshCatalog: sync.refreshCatalog,
    setLang,
    setMember,
  };

  const openCount = ctx.entries.filter((e) => e.status === "OPEN" && e.kind === "GROCERY").length;
  const statusLabel = sync.status === "offline" ? tr("offline") : sync.status === "pending" ? tr("pending") : sync.status === "unauthorized" ? tr("badLink") : tr("live");

  return (
    <div className="app">
      <header className="top">
        <nav className="tabs">
          <button className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>📝 {tr("plan")}</button>
          <button className={tab === "shop" ? "on" : ""} onClick={() => setTab("shop")}>
            🛒 {tr("shop")} {openCount ? <span className="badge">{openCount}</span> : null}
          </button>
          <button className={tab === "settings" ? "on icon" : "icon"} onClick={() => setTab("settings")} aria-label={tr("settings")}>⚙️</button>
        </nav>
        <div className={`sync ${sync.status}`} title={statusLabel}>
          <span className="dot" /> {statusLabel}
        </div>
      </header>
      <main>
        {!sync.view ? <div className="splash small">…</div> : tab === "plan" ? <Plan ctx={ctx} /> : tab === "shop" ? <Shop ctx={ctx} /> : <Settings ctx={ctx} />}
      </main>
      {toastState ? (
        <div className="toast" key={toastState.id}>
          <span>{toastState.msg}</span>
          {toastState.undo ? (
            <button onClick={() => { toastState.undo?.(); setToastState(null); }}>{tr("undo")}</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function groupByCategory(entries: EntryDto[], categories: CategoryDto[]) {
  const known = new Set(categories.map((c) => c.id));
  const groups: { cat: CategoryDto; items: EntryDto[] }[] = [];
  for (const c of categories) {
    const items = entries.filter((e) => (known.has(e.categoryId) ? e.categoryId : "kita") === c.id);
    if (items.length) groups.push({ cat: c, items });
  }
  return groups;
}
