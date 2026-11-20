"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CatalogItem } from "../domain/text";
import type { CategoryDto, EntryDto, EntryPatch } from "../domain/types";
import { call, LS, lsGet, lsSet, markReloadFor, uid } from "./client";
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
  trip: { id: string; startedAt: string; startedBy: string | null; closesAt: string } | null;
  lastTrip: { endedAt: string; items: { productId: string; name: string; categoryId: string; kind: "GROCERY" | "LONGTERM" }[] } | null;
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
    // Keep the token in the address as ?t= (old #t= links too): iPhone's
    // "Add to Home Screen" saves this address as the app's start page, and
    // the Home Screen app does not share Safari's storage.
    const want = `/grocery?t=${encodeURIComponent(token)}`;
    if (location.pathname + location.search !== want || location.hash) history.replaceState(null, "", want);
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

  // Auto-update: when an API reply says a newer build is live, reload as soon
  // as nothing would be lost — no unsent changes, no open sheet, not typing.
  useEffect(() => {
    let target: string | null = null;
    const safe = () => {
      const active = document.activeElement?.tagName;
      const outbox = lsGet(LS.outbox);
      return !document.querySelector(".sheet-bg") && active !== "INPUT" && active !== "TEXTAREA" && (!outbox || outbox === "[]");
    };
    const onUpdate = (e: Event) => {
      target = (e as CustomEvent<string>).detail;
    };
    const timer = setInterval(() => {
      if (target && safe()) {
        markReloadFor(target);
        location.reload();
      }
    }, 1000);
    window.addEventListener("grocery:update", onUpdate);
    return () => {
      clearInterval(timer);
      window.removeEventListener("grocery:update", onUpdate);
    };
  }, []);

  const categories = useMemo(() => sync.view?.categories ?? sync.catalog?.categories ?? [], [sync.view, sync.catalog]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const toast = useCallback((msg: string, undo?: () => void) => {
    const id = Date.now();
    setToastState({ msg, undo, id });
    setTimeout(() => setToastState((s) => (s?.id === id ? null : s)), undo ? 2500 : 2000);
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
        const shown = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
        toast(`+ ${shown}`, () => withIds.forEach((i) => patch(i.id, { status: "REMOVED" })));
      }
    },
    [enqueue, toast, patch],
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
    lastTrip: sync.view?.lastTrip ?? null,
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
  const syncedAgo = sync.syncedAt ? new Date(sync.syncedAt).toLocaleString(lang === "en" ? "en-GB" : "lt-LT", { hour: "2-digit", minute: "2-digit" }) : null;
  const statusLabel = sync.status === "offline" ? `${tr("offline")}${syncedAgo ? ` · ${tr("lastSync", { t: syncedAgo })}` : ""}` : sync.status === "pending" ? tr("pending") : sync.status === "unauthorized" ? tr("badLink") : tr("live");

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
            <button aria-label={tr("undo")} title={tr("undo")} onClick={() => { toastState.undo?.(); setToastState(null); }}>↶</button>
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
