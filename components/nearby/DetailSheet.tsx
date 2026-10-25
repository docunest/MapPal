"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type OpeningHours from "opening_hours";
import { formatDistance } from "@/lib/geo";
import type { PlaceRef } from "@/lib/sources/types";
import { evaluateHours, loadOpeningHours } from "./openingHours";
import { SourceNotes, SourceTag } from "./sources";
import {
  directionsUrl,
  getJson,
  userLang,
  wazeUrl,
  type DetailBlock,
  type DetailsResponse,
  type Selected,
} from "./types";
import { ExplainPanel } from "./ExplainPanel";

function placeRef(sel: Selected): PlaceRef {
  const base = { userLang: userLang(), localLangs: sel.localLangs };
  if (sel.mode === "utility") {
    const p = sel.item;
    return { ...base, key: p.key, mode: "utility", name: p.name, lat: p.lat, lng: p.lng, kind: p.kind, category: p.category, wiki: [], refs: p.refs };
  }
  const s = sel.item;
  return {
    ...base,
    key: s.key,
    mode: "sight",
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    kind: s.kind,
    wikidata: s.wikidata,
    wiki: s.wiki,
    refs: s.osm ? { osm: s.osm } : {},
  };
}

interface Vote {
  targetType: "place" | "source";
  targetKey: string;
  placeKey: string;
  value: number;
}

function useVotes(sel: Selected) {
  const key = sel.item.key;
  const [votes, setVotes] = useState<Vote[]>([]);
  useEffect(() => {
    getJson<{ votes: Vote[] }>(`/api/feedback?places=${encodeURIComponent(key)}`)
      .then((d) => setVotes(d.votes))
      .catch(() => {});
  }, [key]);

  const liked = votes.some((v) => v.targetType === "place" && v.targetKey === key && v.value > 0);
  const sourceVote = (source: string) =>
    votes.find((v) => v.targetType === "source" && v.targetKey === source && v.placeKey === key)?.value ?? 0;

  const send = useCallback(
    async (body: Record<string, unknown>, optimistic: Vote) => {
      setVotes((vs) => [...vs.filter((v) => !(v.targetType === optimistic.targetType && v.targetKey === optimistic.targetKey && v.placeKey === optimistic.placeKey)), optimistic]);
      await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    },
    [],
  );

  const toggleLike = () => {
    const value = liked ? 0 : 1;
    const item = sel.item;
    send(
      {
        targetType: "place",
        targetKey: key,
        placeKind: item.kind,
        value,
        place: {
          name: item.name,
          lat: item.lat,
          lng: item.lng,
          kind: item.kind,
          ...(sel.mode === "sight" && sel.item.wikidata ? { wikidata: sel.item.wikidata } : {}),
          ...(sel.mode === "sight" && sel.item.image?.startsWith("https://") ? { imageUrl: sel.item.image } : {}),
        },
      },
      { targetType: "place", targetKey: key, placeKey: "", value },
    );
  };

  const voteSource = (source: string, value: -1 | 1) => {
    const next = sourceVote(source) === value ? 0 : value;
    send(
      { targetType: "source", targetKey: source, placeKey: key, placeKind: sel.item.kind, value: next },
      { targetType: "source", targetKey: source, placeKey: key, value: next },
    );
  };

  return { liked, toggleLike, sourceVote, voteSource };
}

export function DetailSheet({ sel, onClose }: { sel: Selected; onClose: () => void }) {
  const ref = useMemo(() => placeRef(sel), [sel]);
  const [data, setData] = useState<DetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [OH, setOH] = useState<typeof OpeningHours | null>(null);
  const votes = useVotes(sel);

  useEffect(() => {
    loadOpeningHours().then((lib) => setOH(() => lib)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJson<DetailsResponse>("/api/nearby/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ref),
    })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [ref]);

  // Back button closes the sheet instead of leaving the app.
  useEffect(() => {
    window.history.pushState({ sheet: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onClose]);

  const item = sel.item;
  const hours = sel.mode === "utility" && OH ? evaluateHours(OH, sel.item.openingHours, { ...sel.item, country: sel.country }) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-50" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white/95 px-4 py-2 backdrop-blur">
        <button onClick={() => window.history.back()} className="rounded px-2 py-1 text-lg" aria-label="Back">
          ←
        </button>
        <p className="min-w-0 flex-1 truncate font-medium">{item.name}</p>
        <button
          onClick={votes.toggleLike}
          className={`rounded-full border px-3 py-1 text-sm ${votes.liked ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white"}`}
          title="Like — saves it to the family list"
        >
          👍 {votes.liked ? "Saved" : "Save"}
        </button>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-3">
        {sel.mode === "sight" && sel.item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sel.item.image.replace(/width=\d+/, "width=1000")}
            alt=""
            onError={(e) => (e.currentTarget.style.display = "none")}
            className="max-h-72 w-full rounded-lg object-cover"
          />
        )}

        <div className="space-y-1">
          <h1 className="text-xl font-semibold leading-tight">{item.name}</h1>
          {sel.mode === "sight" && sel.item.localName && <p className="text-sm text-neutral-500">{sel.item.localName}</p>}
          <p className="text-sm text-neutral-600">
            {item.icon} {item.kindLabel} · {formatDistance(item.distance)} {item.compass}
          </p>
          {sel.mode === "sight" && sel.item.description && (
            <p className="text-sm text-neutral-700">
              {sel.item.description}
              {sel.item.descriptionLang && <span className="ml-1 text-xs uppercase text-neutral-400">({sel.item.descriptionLang})</span>}
            </p>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            {item.sources.map((s) => (
              <SourceTag key={s.source} p={s} />
            ))}
          </div>
        </div>

        {sel.mode === "utility" && (
          <section className="space-y-2 rounded-lg border bg-white p-3 text-sm">
            {hours && <p className="font-medium">{hours.label}</p>}
            {sel.item.openingHours && <p className="font-mono text-xs text-neutral-500">{sel.item.openingHours}</p>}
            {sel.item.badges.length > 0 && <p className="text-neutral-700">{sel.item.badges.join(" · ")}</p>}
            {sel.item.address && <p className="text-neutral-700">{sel.item.address}</p>}
            {sel.item.phone && (
              <a href={`tel:${sel.item.phone}`} className="block text-blue-700 underline">
                {sel.item.phone}
              </a>
            )}
            {sel.item.website && (
              <a href={sel.item.website} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-700 underline">
                {sel.item.website}
              </a>
            )}
          </section>
        )}

        <div className="flex gap-2">
          <a href={directionsUrl(item.lat, item.lng)} target="_blank" rel="noopener noreferrer" className="flex-1 rounded bg-blue-600 py-2 text-center text-sm font-medium text-white">
            Google Maps
          </a>
          <a href={wazeUrl(item.lat, item.lng)} target="_blank" rel="noopener noreferrer" className="flex-1 rounded border bg-white py-2 text-center text-sm font-medium">
            Waze
          </a>
        </div>

        {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!data && !error && <div className="h-40 animate-pulse rounded-lg border bg-white" aria-label="Loading details" />}

        {data?.blocks.map((b) => (
          <Block key={b.id} b={b} vote={votes.sourceVote(b.source)} onVote={(v) => votes.voteSource(b.source, v)} />
        ))}

        {data && <ExplainPanel place={ref} />}
        {data && <SourceNotes notes={data.notes} />}
      </div>
    </div>
  );
}

function Block({ b, vote, onVote }: { b: DetailBlock; vote: number; onVote: (v: -1 | 1) => void }) {
  return (
    <section className="space-y-2 rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{b.title}</h2>
        <div className="flex items-center gap-1">
          <SourceTag p={{ source: b.source, url: b.url }} small />
          <button
            onClick={() => onVote(1)}
            aria-label="This source was useful"
            className={`rounded px-1.5 text-sm ${vote > 0 ? "bg-emerald-100" : "opacity-50"}`}
          >
            👍
          </button>
          <button
            onClick={() => onVote(-1)}
            aria-label="This source was not useful"
            className={`rounded px-1.5 text-sm ${vote < 0 ? "bg-red-100" : "opacity-50"}`}
          >
            👎
          </button>
        </div>
      </div>
      <BlockBody b={b} />
    </section>
  );
}

function BlockBody({ b }: { b: DetailBlock }) {
  const s = b.section;
  switch (s.kind) {
    case "article":
      return (
        <div className="space-y-2 text-sm leading-relaxed text-neutral-800">
          {s.translateUrl && (
            <a href={s.translateUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-blue-700 underline">
              Read translated
            </a>
          )}
          {s.lead.split(/\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.sections.map((sec) => (
            <details key={sec.heading} className="rounded border px-2 py-1">
              <summary className="cursor-pointer font-medium">{sec.heading}</summary>
              <div className="space-y-2 pt-1">
                {sec.text.split(/\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      );
    case "concept":
      return <p className="text-sm leading-relaxed text-neutral-800">{s.lead}</p>;
    case "facts":
      return (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
          {s.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-neutral-500">{f.label}</dt>
              <dd className="text-neutral-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "photos":
      return (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {s.photos.map((p) => (
            <a key={p.page} href={p.page} target="_blank" rel="noopener noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" loading="lazy" className="h-28 w-40 rounded object-cover" />
            </a>
          ))}
        </div>
      );
    case "videos":
      return (
        <ul className="space-y-1 text-sm">
          {s.videos.map((v) => (
            <li key={v.url}>
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-700 underline">
                <span aria-hidden>▶</span>
                <span>
                  {v.label}: <span className="text-neutral-600 no-underline">“{v.query}”</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      );
    case "address":
      return <p className="text-sm text-neutral-800">{s.address}</p>;
    case "rating":
      return (
        <div className="space-y-2 text-sm">
          {s.rating !== undefined && (
            <p className="font-medium">
              ★ {s.rating.toFixed(1)} <span className="font-normal text-neutral-500">({s.count ?? 0} reviews)</span>
              {s.priceLevel && <span className="ml-2 text-neutral-500">{s.priceLevel}</span>}
            </p>
          )}
          {s.reviews.map((r, i) => (
            <blockquote key={i} className="border-l-2 pl-2 text-neutral-700">
              {r.rating !== undefined && <span className="mr-1 text-xs">★{r.rating}</span>}
              {r.text}
              {(r.author || r.when) && (
                <span className="block text-xs text-neutral-400">
                  {[r.author, r.when].filter(Boolean).join(" · ")}
                </span>
              )}
            </blockquote>
          ))}
        </div>
      );
    case "hours":
      return (
        <ul className="text-sm text-neutral-800">
          {s.openNow !== undefined && <li className="font-medium">{s.openNow ? "Open now" : "Closed now"}</li>}
          {s.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      );
    case "fuel-prices":
      return (
        <ul className="text-sm text-neutral-800">
          {s.prices.map((p) => (
            <li key={p.type} className="flex justify-between">
              <span>{p.type}</span>
              <span className="tabular-nums">
                {p.price}
                {p.updated && <span className="ml-2 text-xs text-neutral-400">{p.updated}</span>}
              </span>
            </li>
          ))}
        </ul>
      );
    case "ai-text":
      return <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-800">{s.text}</p>;
  }
}
