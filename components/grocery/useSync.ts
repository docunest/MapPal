"use client";
// Near-real-time sync for a few phones without websockets: every open phone
// polls a cheap fingerprint (2 s in the store, 5 s while planning, paused in
// the background) and fetches the list only when it changed.
// Changes go through an outbox kept in localStorage: they show instantly, are
// replayed on top of every server snapshot until the server has them, and are
// retried when the shop has no signal.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/grocery/text";
import type { CategoryDto, EntryDto, TripDto, AddInput, EntryPatch } from "@/lib/grocery/store";
import { call, HttpError, LS, lsGet, lsSet } from "./client";

export type Op =
  | { opId: string; type: "add"; via: string; items: (AddInput & { id: string; categoryId: string; kind: "GROCERY" | "LONGTERM"; productId: string | null; action?: "add" | "remove" })[] }
  | { opId: string; type: "patch"; id: string; patch: EntryPatch }
  | { opId: string; type: "finish" };

type Snapshot = { version: string; catalogVersion: string; entries: EntryDto[]; trip: TripDto; categories: CategoryDto[] };
type Catalog = { version: string; products: CatalogItem[]; categories: CategoryDto[] };

function readJson<T>(key: string): T | null {
  const raw = lsGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function applyOps(snap: Snapshot, ops: Op[], member: string | null): Snapshot {
  let entries = snap.entries.slice();
  let trip = snap.trip;
  const now = new Date().toISOString();
  for (const op of ops) {
    if (op.type === "add") {
      for (const it of op.items) {
        if (it.action === "remove") {
          entries = entries.filter((e) => !(e.productId && e.productId === it.productId && e.status === "OPEN"));
          continue;
        }
        if (entries.some((e) => e.id === it.id)) continue;
        const same = it.productId ? entries.find((e) => e.productId === it.productId && e.status === "OPEN") : undefined;
        if (same) continue; // server will merge into the existing line
        entries.push({
          id: it.id, productId: it.productId, name: it.name, categoryId: it.categoryId, kind: it.kind,
          qty: it.qty ?? null, note: it.note ?? null, status: "OPEN", via: op.via, addedBy: member, addedAt: now, boughtAt: null, boughtBy: null,
        });
      }
    } else if (op.type === "patch") {
      entries = entries
        .map((e) => {
          if (e.id !== op.id) return e;
          const n = { ...e };
          if (op.patch.status === "BOUGHT") Object.assign(n, { status: "BOUGHT", boughtAt: n.boughtAt ?? now, boughtBy: n.boughtBy ?? member });
          if (op.patch.status === "OPEN") Object.assign(n, { status: "OPEN", boughtAt: null, boughtBy: null });
          if (op.patch.status === "REMOVED") return null;
          if (op.patch.qty !== undefined) n.qty = op.patch.qty;
          if (op.patch.note !== undefined) n.note = op.patch.note;
          if (op.patch.categoryId) n.categoryId = op.patch.categoryId;
          if (op.patch.kind) n.kind = op.patch.kind;
          return n;
        })
        .filter((e): e is EntryDto => e !== null);
      if (op.patch.status === "BOUGHT" && !trip) trip = { id: "pending", startedAt: now, startedBy: member };
    } else if (op.type === "finish") {
      entries = entries.filter((e) => e.status !== "BOUGHT");
      trip = null;
    }
  }
  return { ...snap, entries, trip };
}

export type SyncStatus = "live" | "pending" | "offline" | "unauthorized";

export function useSync(opts: { fast: boolean; member: string | null }) {
  const [server, setServer] = useState<Snapshot | null>(() => readJson<Snapshot>(LS.state));
  const [catalog, setCatalog] = useState<Catalog | null>(() => readJson<Catalog>(LS.catalog));
  const [outbox, setOutbox] = useState<Op[]>(() => readJson<Op[]>(LS.outbox) ?? []);
  const [status, setStatus] = useState<SyncStatus>("live");
  const outboxRef = useRef(outbox);
  const serverRef = useRef(server);
  const catalogRef = useRef(catalog);
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastRef = useRef(opts.fast);
  useEffect(() => {
    fastRef.current = opts.fast;
  }, [opts.fast]);

  const saveOutbox = (ops: Op[]) => {
    outboxRef.current = ops;
    lsSet(LS.outbox, JSON.stringify(ops));
    setOutbox(ops);
  };

  const loadCatalog = useCallback(async () => {
    const c = await call<Catalog>("/api/grocery/catalog");
    catalogRef.current = c;
    lsSet(LS.catalog, JSON.stringify(c));
    setCatalog(c);
  }, []);

  const poll = useCallback(async () => {
    try {
      const v = serverRef.current?.version;
      const r = await call<Snapshot & { unchanged?: boolean }>(`/api/grocery/state${v ? `?v=${encodeURIComponent(v)}` : ""}`);
      if (!r.unchanged) {
        serverRef.current = r;
        lsSet(LS.state, JSON.stringify(r));
        setServer(r);
      }
      if (!catalogRef.current || catalogRef.current.version !== r.catalogVersion) await loadCatalog();
      setStatus(outboxRef.current.length ? "pending" : "live");
    } catch (err) {
      setStatus(err instanceof HttpError && err.status === 401 ? "unauthorized" : "offline");
    }
  }, [loadCatalog]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (outboxRef.current.length) {
        const op = outboxRef.current[0];
        try {
          if (op.type === "add") await call("/api/grocery/entries", { method: "POST", body: { items: op.items, via: op.via } });
          else if (op.type === "patch") await call(`/api/grocery/entries/${op.id}`, { method: "PATCH", body: op.patch });
          else await call("/api/grocery/trip/finish", { method: "POST" });
        } catch (err) {
          if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 401) {
            // Rejected for good (e.g. bad input): drop it, keep going.
          } else {
            setStatus(err instanceof HttpError && err.status === 401 ? "unauthorized" : "offline");
            return;
          }
        }
        saveOutbox(outboxRef.current.filter((o) => o.opId !== op.opId));
      }
    } finally {
      flushing.current = false;
    }
    await poll();
  }, [poll]);

  // Poll loop: fast in the store, slower while planning, paused when hidden.
  useEffect(() => {
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        if (outboxRef.current.length) await flush();
        else await poll();
      }
      if (!stopped) timer.current = setTimeout(loop, fastRef.current ? 2000 : 5000);
    };
    loop();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (timer.current) clearTimeout(timer.current);
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onVis);
    };
  }, [flush, poll]);

  const enqueue = useCallback(
    (op: Op) => {
      saveOutbox([...outboxRef.current, op]);
      setStatus("pending");
      void flush();
    },
    [flush],
  );

  const view = server ? applyOps(server, outbox, opts.member) : null;
  return { view, catalog, status, enqueue, refreshCatalog: loadCatalog, poll };
}
