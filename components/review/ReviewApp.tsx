"use client";

// Review app (/review): swipe through the places the agent found — per
// person — or see them all on a map. Phone first; on a wide screen the map
// and the cards sit side by side.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLocation } from "@/components/nearby/useLocation";
import { buildUseCaseTree } from "@/lib/agent/domain/tree";
import { BrowsePanel } from "./BrowsePanel";
import { KindTitles, kindPaths, type KindNode } from "./KindPicker";
import { ConfigPanel } from "./ConfigPanel";
import { PlaceCard } from "./PlaceCard";
import { DEFAULT_SCOPE, ScopePanel, type ScopeUi } from "./ScopePanel";
import { SwipeDeck } from "./SwipeDeck";
import { ago, save, store, VOTE_UI, type ReviewPlace, type VoteValue } from "./shared";
import type { MapLayers, MapShow } from "./ReviewMap";

const ReviewMap = dynamic(() => import("./ReviewMap").then((m) => m.ReviewMap), { ssr: false, loading: () => <div className="h-full w-full bg-neutral-100" /> });

interface Layers extends MapLayers {
  runs: Array<{ id: string; status: string; at: string; name: string; lat?: number; lng?: number }>;
  travel: { position: { lat: number; lng: number; label: string; source: string; at: string } | null; target: { lat: number; lng: number; label: string } | null };
}
interface PlacesReply {
  places: ReviewPlace[];
  inArea: number;
  mine: Record<string, number>;
  error?: string;
}
interface QueuedVote {
  voter: string;
  placeKey: string;
  vote: VoteValue | null;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

const QUEUE = "review.queue";
const LISBON = { lat: 38.7223, lng: -9.1393 };

async function putVote(v: QueuedVote) {
  const res = await fetch("/api/review/votes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
  if (!res.ok) throw new Error(String(res.status));
}

/** Votes made offline wait here and go out when the phone is back online. */
async function flushQueue() {
  const q = store<QueuedVote[]>(QUEUE, []);
  const left: QueuedVote[] = [];
  for (const v of q) {
    try {
      await putVote(v);
    } catch {
      left.push(v);
    }
  }
  save(QUEUE, left);
  return left.length;
}

function km2(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function ReviewApp() {
  const { state: loc } = useLocation();
  const meLat = loc.status === "ready" ? loc.loc.lat : null;
  const meLng = loc.status === "ready" ? loc.loc.lng : null;
  const me = useMemo(() => (meLat !== null && meLng !== null ? { lat: meLat, lng: meLng } : null), [meLat, meLng]);
  const [voters, setVoters] = useState<string[]>([]);
  const [voter, setVoter] = useState("");
  const [askName, setAskName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [scope, setScopeState] = useState<ScopeUi>(DEFAULT_SCOPE);
  const [layers, setLayers] = useState<Layers | null>(null);
  const [deck, setDeck] = useState<PlacesReply | null>(null);
  const [mapPlaces, setMapPlaces] = useState<ReviewPlace[]>([]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Array<{ place: ReviewPlace; prev: VoteValue | null }>>([]);
  // Three modes: swipe (the cards), browse (map + list + index control), config (rules, tokens).
  const [mode, setModeState] = useState<"swipe" | "browse" | "config">("swipe");
  const setMode = (m: "swipe" | "browse" | "config") => {
    setModeState(m);
    save("review.mode", m);
  };
  const [kinds, setKinds] = useState<KindNode[]>([]);
  const kindTitles = useMemo(() => kindPaths(kinds), [kinds]);
  const [panel, setPanel] = useState(false);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<ReviewPlace | null>(null);
  const [show, setShow] = useState<MapShow>({ nope: false, never: false, sent: true, tiles: true });
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Restore the person and the filters this phone used last.
  useEffect(() => {
    const v = store("review.voter", "");
    /* eslint-disable react-hooks/set-state-in-effect -- reading this device's saved choices once */
    setScopeState({ ...DEFAULT_SCOPE, ...store<Partial<ScopeUi>>("review.scope", {}) });
    setShow((s) => ({ ...s, ...store<Partial<MapShow>>("review.show", {}) }));
    setPending(store<QueuedVote[]>(QUEUE, []).length);
    setModeState(store<"swipe" | "browse" | "config">("review.mode", "swipe"));
    if (v) setVoter(v);
    else setAskName(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    loaded.current = true;
    fetch("/api/review/voters").then((r) => r.json()).then((d) => setVoters(d.voters ?? [])).catch(() => undefined);
    fetch("/api/agent/rules")
      .then((r) => r.json())
      .then((d) => setKinds(buildUseCaseTree((d.rules ?? []).filter((r: { layer: string }) => r.layer === "usecase")).map(({ key, title, parent, depth, children, runs }) => ({ key, title, parent, depth, children, runs }))))
      .catch(() => undefined);
    flushQueue().then(setPending);
    const online = () => flushQueue().then(setPending);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);

  const setScope = (s: ScopeUi) => {
    setScopeState(s);
    save("review.scope", s);
  };

  const car = layers?.travel.position ?? layers?.travel.target ?? null;
  const center = useMemo(() => {
    if (scope.center === "pin" && scope.pin) return { ...scope.pin, label: "your pin" };
    if (scope.center === "car" && car) return { lat: car.lat, lng: car.lng, label: `best guess: ${car.label}` };
    if (me) return { ...me, label: "where you are" };
    if (car) return { lat: car.lat, lng: car.lng, label: `best guess: ${car.label} (no GPS on this device)` };
    return { ...LISBON, label: "Lisbon (no location yet)" };
  }, [scope.center, scope.pin, car, me]);

  // Sent-to-car links, the place-index cells around the area, the travel best guess.
  const [layersTick, setLayersTick] = useState(0);
  useEffect(() => {
    fetch(`/api/review/layers?lat=${center.lat}&lng=${center.lng}&r=${scope.radiusKm ?? 50}`)
      .then((r) => r.json())
      .then((d) => !d.error && setLayers(d))
      .catch(() => undefined);
  }, [center.lat, center.lng, scope.radiusKm, layersTick]);

  const query = useCallback(
    (mine: string) => {
      const q = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), r: scope.radiusKm ? String(scope.radiusKm) : "all", cat: scope.categories.join(","), pool: scope.pool, voter, mine });
      if (scope.other) {
        q.set("other", scope.other);
        q.set("otherStatus", scope.otherStatus);
      }
      return `/api/review/places?${q}`;
    },
    [center.lat, center.lng, scope, voter],
  );

  // The swipe pool for these filters (nearest first).
  useEffect(() => {
    if (!voter) return;
    let stale = false;
    fetch(query(scope.mine))
      .then((r) => r.json())
      .then((d: PlacesReply) => {
        if (stale) return;
        setError(d.error ?? null);
        setDeck(d);
        setIndex(0);
        setHistory([]);
      })
      .catch((e) => !stale && setError(String(e)));
    fetch(query("any"))
      .then((r) => r.json())
      .then((d: PlacesReply) => !stale && setMapPlaces(d.places ?? []))
      .catch(() => undefined);
    return () => {
      stale = true;
    };
    // layersTick: re-read after indexing or a pasted manual answer.
  }, [query, scope.mine, voter, layersTick]);

  const remember = (key: string, v: VoteValue | null) => {
    const apply = (p: ReviewPlace) => {
      if (p.key !== key) return p;
      const votes = { ...(p.votes ?? {}) };
      if (v) votes[voter] = v;
      else delete votes[voter];
      return { ...p, votes };
    };
    setMapPlaces((list) => list.map(apply));
    setDeck((d) => (d ? { ...d, places: d.places.map(apply) } : d));
    setSelected((s) => (s ? apply(s) : s));
  };

  const sendVote = async (p: ReviewPlace, v: VoteValue | null) => {
    const body: QueuedVote = { voter, placeKey: p.key, vote: v, name: p.name, category: p.category, lat: p.lat, lng: p.lng };
    remember(p.key, v);
    try {
      await putVote(body);
    } catch {
      save(QUEUE, [...store<QueuedVote[]>(QUEUE, []).filter((q) => !(q.voter === voter && q.placeKey === p.key)), body]);
      setPending(store<QueuedVote[]>(QUEUE, []).length);
    }
  };

  const onVote = (p: ReviewPlace, v: VoteValue) => {
    setHistory((h) => [...h, { place: p, prev: p.votes?.[voter] ?? null }]);
    setIndex((i) => i + 1);
    void sendVote(p, v);
  };

  const onUndo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    void sendVote(last.place, last.prev);
  };

  const sendToCar = async (p: ReviewPlace) => {
    setSending(p.key);
    try {
      const res = await fetch("/api/dock/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: p.name, lat: p.lat, lng: p.lng, from: `review (${voter})` }) });
      const d = await res.json().catch(() => ({}));
      setToast(res.ok && !d.error ? `🚐 ${p.name} sent to the car` : `Couldn't send: ${d.error ? JSON.stringify(d.error) : res.status}`);
      setLayersTick((t) => t + 1);
    } catch {
      setToast("Couldn't send — no connection?");
    } finally {
      setSending(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const chooseVoter = async (name: string) => {
    const n = name.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!n) return;
    setVoter(n);
    save("review.voter", n);
    setAskName(false);
    setNameInput("");
    if (!voters.includes(n)) {
      setVoters((v) => [...v, n]);
      fetch("/api/review/voters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) }).catch(() => undefined);
    }
  };

  // What the agent has done around here (indexed tiles near the centre, newest run).
  const indexText = useMemo(() => {
    if (!layers) return "checking the agent's work…";
    const near = layers.tiles.filter((t) => km2(center, { lat: (t.box.s + t.box.n) / 2, lng: (t.box.w + t.box.e) / 2 }) <= (scope.radiusKm ?? 50) + 3);
    const runs = layers.runs.filter((r) => r.lat !== undefined && km2(center, { lat: r.lat!, lng: r.lng! }) <= (scope.radiusKm ?? 50) + 15);
    if (!near.length && !runs.length) return "the agent hasn't indexed this area yet — ask Claude Code to \"recheck location\" here";
    const last = runs[0];
    return `agent: ${near.length} tiles indexed nearby${last ? `, last run ${last.name} ${ago(last.at)}${last.status === "planned" ? " (dry run only)" : ""}` : ""}`;
  }, [layers, center, scope.radiusKm]);

  const places = deck?.places ?? [];
  const left = Math.max(0, places.length - index);
  const status = { inArea: deck?.inArea ?? 0, left, mine: deck?.mine ?? {}, index: indexText, centerLabel: center.label };

  const map = (
    <ReviewMap
      places={mapPlaces}
      voter={voter}
      me={me}
      scope={{ lat: center.lat, lng: center.lng, radiusKm: scope.radiusKm }}
      layers={layers}
      show={show}
      categories={scope.categories}
      onSelect={setSelected}
      onCenter={(c) => {
        setScope({ ...scope, center: "pin", pin: c });
        if (picking) {
          setPicking(false);
          setPanel(true);
        }
      }}
    />
  );

  const toggles = (
    <div className="flex flex-wrap gap-1 text-xs">
      {(
        [
          ["nope", `${VOTE_UI.nope.icon} Disliked`],
          ["never", `${VOTE_UI.never.icon} Never`],
          ["sent", "🚐 Sent to car"],
          ["tiles", "▦ Index cells"],
        ] as Array<[keyof MapShow, string]>
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            const next = { ...show, [k]: !show[k] };
            setShow(next);
            save("review.show", next);
          }}
          className={`rounded-full border px-2 py-1 ${show[k] ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white/90"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const cards = (
    <div className="flex h-full flex-col px-3 pt-2">
      {error && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <SwipeDeck
        places={places}
        index={index}
        me={me}
        voter={voter}
        onVote={onVote}
        onUndo={onUndo}
        canUndo={history.length > 0}
        actions={{ onSendToCar: sendToCar, sending: sending !== null }}
        emptyText={deck ? `Nothing left to swipe here (${deck.inArea} places in the area). Widen the distance, pick "Everything found", or change the vote filter.` : "Loading…"}
      />
    </div>
  );

  return (
    <KindTitles.Provider value={kindTitles}>
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
        <Link href="/" className="text-sm text-neutral-500" aria-label="MapPal home">
          ←
        </Link>
        <h1 className="hidden font-semibold sm:block">Review</h1>
        <button type="button" onClick={() => setAskName(true)} className="max-w-[7.5rem] truncate rounded-full bg-neutral-100 px-3 py-1 text-sm">
          👤 {voter || "who?"}
        </button>
        <span className="ml-auto hidden text-xs text-neutral-500 sm:inline">{pending ? `${pending} vote${pending > 1 ? "s" : ""} waiting for signal` : ""}</span>
        {pending > 0 && <span className="ml-auto text-xs text-amber-700 sm:hidden" title="votes waiting for signal">⏳{pending}</span>}
        {mode !== "config" && (
          <button type="button" onClick={() => setPanel((p) => !p)} aria-label="Filter" className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${pending ? "" : "ml-auto sm:ml-0"} ${panel ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
            ⚲ {mode === "swipe" ? left : mapPlaces.length}
          </button>
        )}
        <div className={`flex overflow-hidden rounded-full border border-neutral-300 text-sm ${mode === "config" && !pending ? "ml-auto sm:ml-0" : ""}`}>
          {(
            [
              ["swipe", "🃏", "Swipe"],
              ["browse", "🗺️", "Browse"],
              ["config", "⚙️", "Config"],
            ] as const
          ).map(([m, icon, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-label={label} className={`px-3 py-1 ${mode === m ? "bg-neutral-900 text-white" : "bg-white"}`}>
              {icon}
              <span className="hidden sm:inline"> {label}</span>
            </button>
          ))}
        </div>
      </header>

      {panel && (
        <div className="max-h-[60vh] overflow-y-auto border-b border-neutral-200 bg-white p-3 lg:absolute lg:right-3 lg:top-14 lg:z-20 lg:w-[420px] lg:rounded-xl lg:border lg:shadow-xl">
          <ScopePanel
            scope={scope}
            onChange={setScope}
            voters={voters}
            voter={voter}
            status={status}
            kinds={kinds}
            onPickPin={() => {
              setPicking(true);
              setMode("browse");
              setPanel(false);
            }}
          />
          <div className="mt-3 flex justify-between">
            <Link href="/agent/runs" className="text-xs underline">
              Agent runs →
            </Link>
            <button type="button" onClick={() => setPanel(false)} className="rounded-full bg-neutral-900 px-4 py-1 text-sm text-white">
              {mode === "swipe" ? `Swipe ${left}` : `Show ${mapPlaces.length}`}
            </button>
          </div>
        </div>
      )}

      {mode === "config" ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ConfigPanel voter={voter} />
        </main>
      ) : (
      <main className={`relative min-h-0 flex-1 ${mode === "browse" ? "flex flex-col" : ""} lg:grid lg:grid-cols-[1fr_440px]`}>
        <section className={`relative ${mode === "browse" ? "h-[50%] lg:h-full" : "hidden h-full lg:block"}`}>
          {map}
          <div className="absolute left-2 top-2 z-10 max-w-[70%]">{toggles}</div>
          {picking && <div className="absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-full bg-neutral-900 px-3 py-1 text-xs text-white">Move the map, then tap “Search here”</div>}
          {selected && (
            <div className="absolute inset-x-2 bottom-14 z-20 max-h-[65%] overflow-y-auto rounded-2xl bg-white p-3 shadow-xl lg:left-auto lg:w-[400px]">
              <div className="mb-1 flex justify-end">
                <button type="button" onClick={() => setSelected(null)} className="rounded-full bg-neutral-100 px-3 py-1 text-xs">
                  Close
                </button>
              </div>
              <PlaceCard place={selected} me={me} voter={voter} compact actions={{ onSendToCar: sendToCar, sending: sending !== null }} />
              <div className="mt-2 flex justify-center gap-4">
                {(["nope", "never", "maybe", "like"] as VoteValue[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void sendVote(selected, selected.votes?.[voter] === v ? null : v)}
                    aria-label={VOTE_UI[v].label}
                    className="flex flex-col items-center text-[11px]"
                    style={{ color: VOTE_UI[v].color }}
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg"
                      style={{ borderColor: VOTE_UI[v].color, color: selected.votes?.[voter] === v ? "#fff" : VOTE_UI[v].color, background: selected.votes?.[voter] === v ? VOTE_UI[v].color : "#fff" }}
                    >
                      {VOTE_UI[v].icon}
                    </span>
                    {VOTE_UI[v].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        {mode === "swipe" ? (
          <section className="h-full lg:border-l lg:border-neutral-200 lg:bg-white">{cards}</section>
        ) : (
          <section className="min-h-0 flex-1 border-t border-neutral-200 bg-white lg:h-full lg:border-l lg:border-t-0">
            <BrowsePanel
              places={mapPlaces}
              voter={voter}
              center={center}
              radiusKm={scope.radiusKm}
              onSelect={setSelected}
              onIndexed={() => setLayersTick((t) => t + 1)}
              kinds={kinds}
              kindFilter={scope.categories}
              onKindFilter={(categories) => setScope({ ...scope, categories })}
            />
          </section>
        )}
      </main>
      )}

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow">{toast}</div>}

      {askName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4">
            <h2 className="text-lg font-semibold">Who&apos;s swiping?</h2>
            <p className="text-sm text-neutral-600">Each name keeps its own votes.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {voters.map((v) => (
                <button key={v} type="button" onClick={() => chooseVoter(v)} className={`rounded-full border px-3 py-1 ${v === voter ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
                  {v}
                </button>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void chooseVoter(nameInput);
              }}
            >
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="New name" className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2" />
              <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
                Go
              </button>
            </form>
            {voter && (
              <button type="button" onClick={() => setAskName(false)} className="mt-3 text-sm text-neutral-500 underline">
                Keep {voter}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    </KindTitles.Provider>
  );
}
