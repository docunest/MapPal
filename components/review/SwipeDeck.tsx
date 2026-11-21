"use client";

import { useRef, useState } from "react";
import { PlaceCard, type CardActions } from "./PlaceCard";
import { VOTE_UI, type ReviewPlace, type VoteValue } from "./shared";

// Swipe: right = like, left = don't like, up = undecided, down = never.
const THRESHOLD = 90;

function voteFor(dx: number, dy: number): VoteValue | null {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > THRESHOLD ? "like" : dx < -THRESHOLD ? "nope" : null;
  return dy < -THRESHOLD ? "maybe" : dy > THRESHOLD * 1.3 ? "never" : null;
}

const FLY: Record<VoteValue, { x: number; y: number }> = { like: { x: 600, y: 0 }, nope: { x: -600, y: 0 }, maybe: { x: 0, y: -800 }, never: { x: 0, y: 800 } };

export function SwipeDeck({
  places,
  index,
  me,
  voter,
  onVote,
  onUndo,
  canUndo,
  actions,
  emptyText,
}: {
  places: ReviewPlace[];
  index: number;
  me?: { lat: number; lng: number } | null;
  voter: string;
  onVote: (p: ReviewPlace, v: VoteValue) => void;
  onUndo: () => void;
  canUndo: boolean;
  actions?: CardActions;
  emptyText: string;
}) {
  const [details, setDetails] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState<VoteValue | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const card = places[index];
  const next = places[index + 1];

  const commit = (v: VoteValue) => {
    if (!card || flying) return;
    setFlying(v);
    setTimeout(() => {
      onVote(card, v);
      setFlying(null);
      setDrag(null);
    }, 220);
  };

  const dx = flying ? FLY[flying].x : drag?.x ?? 0;
  const dy = flying ? FLY[flying].y : drag?.y ?? 0;
  const hint = flying ?? (drag ? voteFor(drag.x, drag.y) : null);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        {!card && <div className="flex h-full items-center justify-center p-6 text-center text-neutral-600">{emptyText}</div>}
        {next && (
          <div className="absolute inset-0 scale-[0.97] overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 opacity-70 shadow-sm" aria-hidden>
            <PlaceCard place={next} me={me} voter={voter} compact />
          </div>
        )}
        {card && (
          <div
            key={card.key}
            className="absolute inset-0 touch-none overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 shadow-lg"
            style={{
              transform: `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`,
              transition: drag && !flying ? "none" : "transform 0.22s ease-out",
            }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("a,button")) return;
              start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDrag({ x: 0, y: 0 });
            }}
            onPointerMove={(e) => {
              if (!start.current || start.current.id !== e.pointerId) return;
              setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
            }}
            onPointerUp={(e) => {
              if (!start.current) return;
              const v = voteFor(e.clientX - start.current.x, e.clientY - start.current.y);
              start.current = null;
              if (v) commit(v);
              else setDrag(null);
            }}
            onPointerCancel={() => {
              start.current = null;
              setDrag(null);
            }}
          >
            {hint && (
              <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-xl border-4 bg-white/90 px-4 py-1 text-2xl font-bold" style={{ color: VOTE_UI[hint].color, borderColor: VOTE_UI[hint].color }}>
                {VOTE_UI[hint].icon} {VOTE_UI[hint].label}
              </div>
            )}
            <div className="h-full overflow-hidden">
              <PlaceCard place={card} me={me} voter={voter} actions={actions} />
            </div>
            <button type="button" onClick={() => setDetails(true)} className="absolute bottom-2 right-2 rounded-full bg-neutral-900/80 px-3 py-1 text-xs text-white">
              ⓘ All details
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 py-3">
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" className="h-10 w-10 rounded-full border border-neutral-300 bg-white text-lg disabled:opacity-30">↶</button>
        {(["nope", "never", "maybe", "like"] as VoteValue[]).map((v) => (
          <button
            key={v}
            type="button"
            disabled={!card}
            onClick={() => commit(v)}
            aria-label={VOTE_UI[v].label}
            title={VOTE_UI[v].label}
            className={`${v === "like" || v === "nope" ? "h-14 w-14 text-2xl" : "h-11 w-11 text-lg"} rounded-full border-2 bg-white shadow disabled:opacity-30`}
            style={{ borderColor: VOTE_UI[v].color, color: VOTE_UI[v].color }}
          >
            {VOTE_UI[v].icon}
          </button>
        ))}
      </div>
      <p className="pb-1 text-center text-[11px] text-neutral-500">→ like · ← don&apos;t like · ↑ undecided · ↓ never</p>
      {details && card && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setDetails(false)}>
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setDetails(false)} className="rounded-full bg-neutral-100 px-3 py-1 text-sm">Close</button>
            </div>
            <PlaceCard place={card} me={me} voter={voter} actions={actions} />
          </div>
        </div>
      )}
    </div>
  );
}
