"use client";

import { MiniMap } from "./MiniMap";
import { useKindTitle } from "./KindPicker";
import { COMPLICATION_UI, scoreClass, ago, compass, gmaps, iconFor, km, VOTE_UI, waze, type ReviewPlace } from "./shared";

export interface CardActions {
  onSendToCar?: (p: ReviewPlace) => void;
  sending?: boolean;
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${className}`}>{children}</span>;
}

/** Everything about one place, laid out for a phone: photo, where, what the agent said, the facts, the way there. */
export function PlaceCard({ place: p, me, voter, actions, compact = false }: { place: ReviewPlace; me?: { lat: number; lng: number } | null; voter: string; actions?: CardActions; compact?: boolean }) {
  const kindTitle = useKindTitle();
  const a = p.agent;
  const others = Object.entries(p.votes ?? {}).filter(([v]) => v !== voter);
  const mine = p.votes?.[voter];
  return (
    <div className="flex flex-col gap-2">
      {p.photo ? (
        <div className="relative -mx-3 -mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.photo.url} alt={p.name} draggable={false} className={`w-full select-none object-cover ${compact ? "h-36" : "h-44"} rounded-t-2xl`} />
          {p.photo.credit && <span className="absolute bottom-1 right-2 rounded bg-black/50 px-1 text-[10px] text-white">{p.photo.credit}</span>}
        </div>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold leading-tight">
          {iconFor(p.kind)} {p.name}
        </h2>
        <div className="text-sm text-neutral-600">
          {p.kind.replace(/_/g, " ")} · {kindTitle(p.category)}
          {p.distanceM !== undefined && ` · ${km(p.distanceM)} ${compass(p.bearing)}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {a ? (
          <>
            <Chip className={a.verdict === "real" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
              {a.verdict} {Math.round(a.confidence * 100)}%
            </Chip>
            {typeof a.score === "number" && (
              <Chip className={scoreClass(a.score)}>
                <span title="AI score: 0 = no-go, 50 = undecided, 100 = a must">AI {a.score}/100</span>
              </Chip>
            )}
            <Chip className="bg-purple-100 text-purple-800">AI {a.keep ? "pick" : "not picked"}</Chip>
            {a.vibe && <Chip className="bg-neutral-100">{a.vibe}</Chip>}
            {a.access && <Chip className="bg-neutral-100">access: {a.access}</Chip>}
            {a.complications?.map((c, i) => (
              <Chip key={`${c.flag}${i}`} className={c.severity === "blocker" ? "bg-red-600 text-white" : c.severity === "minor" ? "bg-amber-50 text-amber-800" : "bg-amber-200 text-amber-900"}>
                <span title={c.note}>{COMPLICATION_UI[c.flag] ?? c.flag}</span>
              </Chip>
            ))}
          </>
        ) : (
          <Chip className="bg-neutral-100 text-neutral-600">not checked by the agent yet</Chip>
        )}
        {a?.onMap === false && <Chip className="bg-amber-100 text-amber-900">⚠ not on the map — found by the agent{a.listedOn?.length ? ` (${a.listedOn.join(", ")})` : ""}, check the link</Chip>}
        {p.visitedAt && <Chip className="bg-blue-100 text-blue-800">✓ been here {ago(p.visitedAt)}</Chip>}
        {p.sentAt && <Chip className="bg-indigo-100 text-indigo-800">🚐 sent to car {ago(p.sentAt)}</Chip>}
        {mine && <Chip className="bg-neutral-800 text-white">you: {VOTE_UI[mine].icon} {VOTE_UI[mine].label}</Chip>}
        {others.map(([name, v]) => (
          <Chip key={name} className="border border-neutral-300">
            {name}: {VOTE_UI[v].icon}
          </Chip>
        ))}
      </div>
      {a?.summary && (
        <p className="text-sm">
          <span className="mr-1 rounded bg-purple-100 px-1 text-[10px] text-purple-800">AI</span>
          {a.summary}
        </p>
      )}
      <ul className="space-y-0.5 text-xs text-neutral-700">
        {p.tags.opening_hours && <li>🕒 {p.tags.opening_hours} <span className="text-neutral-400">(OSM)</span></li>}
        {a?.kitchenHours && <li>🍳 Kitchen: {a.kitchenHours}</li>}
        {a?.peakTimes && <li>👥 Busy: {a.peakTimes}</li>}
        {a?.foodTags?.length ? <li>🍴 {a.foodTags.join(", ")}</li> : null}
        {a?.prices?.length ? <li>💶 {a.prices.map((x) => `${x.item}${x.size ? ` (${x.size})` : ""} ${x.price} ${x.currency ?? "€"}`).join(" · ")}</li> : null}
        {a?.complications?.filter((c) => c.note).map((c, i) => (
          <li key={`cn${i}`}>
            {COMPLICATION_UI[c.flag] ?? c.flag} ({c.severity}): {c.note}
          </li>
        ))}
        {a?.risks?.map((r, i) => <li key={i}>⚠️ {r.flag}: {r.note}</li>)}
        {a?.howToGetThere && <li>🧭 {a.howToGetThere}</li>}
        {(a?.parking || p.parking) && <li>🅿️ {a?.parking ?? `${p.parking!.name ?? "Parking"} ${km(p.parking!.distanceM)} away (OSM)`}</li>}
        {a?.safety && <li>🦺 {a.safety}</li>}
        {p.tags.description && <li>ℹ️ {p.tags.description} <span className="text-neutral-400">(OSM)</span></li>}
      </ul>
      {!compact && <MiniMap place={p} me={me} height={p.photo ? 120 : 200} />}
      <div className="flex flex-wrap gap-1 text-xs">
        <a href={waze(p)} target="_blank" rel="noreferrer" className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">Waze</a>
        <a href={gmaps(p)} target="_blank" rel="noreferrer" className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">Google Maps</a>
        {actions?.onSendToCar && (
          <button type="button" disabled={actions.sending} onClick={() => actions.onSendToCar!(p)} className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-800">
            {actions.sending ? "Sending…" : "🚐 Send to car"}
          </button>
        )}
        {!p.key.startsWith("ext/") && <a href={`https://www.openstreetmap.org/${p.key}`} target="_blank" rel="noreferrer" className="rounded-full bg-neutral-100 px-2 py-1">OSM</a>}
        {a?.links?.google && <a href={a.links.google} target="_blank" rel="noreferrer" className="rounded-full bg-amber-50 px-2 py-1 text-amber-900">Google listing</a>}
        {a?.links?.instagram && <a href={a.links.instagram} target="_blank" rel="noreferrer" className="rounded-full bg-pink-50 px-2 py-1 text-pink-800">Instagram</a>}
        {a?.links?.website && !p.tags.website && <a href={a.links.website} target="_blank" rel="noreferrer" className="rounded-full bg-neutral-100 px-2 py-1">Website</a>}
        {p.tags.website && <a href={p.tags.website} target="_blank" rel="noreferrer" className="rounded-full bg-neutral-100 px-2 py-1">Website</a>}
        {a?.evidence?.filter((e) => e.url).slice(0, 2).map((e, i) => (
          <a key={i} href={e.url} target="_blank" rel="noreferrer" className="rounded-full bg-neutral-100 px-2 py-1">{e.kind}</a>
        ))}
      </div>
    </div>
  );
}
