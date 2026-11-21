"use client";

import { CATEGORY_LABEL, type VoteValue } from "./shared";

export type CenterSource = "me" | "car" | "pin";

export interface ScopeUi {
  center: CenterSource;
  pin: { lat: number; lng: number } | null;
  radiusKm: number | null;
  categories: string[];
  pool: "checked" | "checked-all" | "everything";
  mine: "unvoted" | VoteValue | "any";
  other: string;
  otherStatus: "voted" | "like" | "unvoted";
}

export const DEFAULT_SCOPE: ScopeUi = { center: "me", pin: null, radiusKm: 20, categories: [], pool: "checked", mine: "unvoted", other: "", otherStatus: "voted" };

const RADII: Array<number | null> = [5, 20, 50, 100, null];

function Chips<T extends string | number | null>({ options, value, onChange, label }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-neutral-500">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} className={`rounded-full border px-3 py-1 text-sm ${v === value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "What do I swipe?" — the area, the kind of place, how wide a net, and whose votes. */
export function ScopePanel({
  scope,
  onChange,
  voters,
  voter,
  status,
  onPickPin,
}: {
  scope: ScopeUi;
  onChange: (s: ScopeUi) => void;
  voters: string[];
  voter: string;
  status: { inArea: number; left: number; mine: Record<string, number>; index: string; centerLabel: string };
  onPickPin: () => void;
}) {
  const set = (patch: Partial<ScopeUi>) => onChange({ ...scope, ...patch });
  const others = voters.filter((v) => v !== voter);
  return (
    <div className="space-y-3">
      <Chips
        label={`Around — ${status.centerLabel}`}
        value={scope.center}
        onChange={(v) => (v === "pin" ? onPickPin() : set({ center: v }))}
        options={[["me", "📍 Me"], ["car", "🚐 Car / last shared"], ["pin", scope.pin ? "📌 My pin (change)" : "📌 Pin on map…"]]}
      />
      <Chips label="Distance" value={scope.radiusKm} onChange={(v) => set({ radiusKm: v })} options={RADII.map((r) => [r, r ? `${r} km` : "Anywhere"])} />
      <div>
        <div className="mb-1 text-xs font-medium text-neutral-500">Kind</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(CATEGORY_LABEL).map(([k, label]) => {
            const on = scope.categories.includes(k);
            return (
              <button key={k} type="button" onClick={() => set({ categories: on ? scope.categories.filter((c) => c !== k) : [...scope.categories, k] })} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
                {label}
              </button>
            );
          })}
          {!scope.categories.length && <span className="self-center text-xs text-neutral-500">all kinds</span>}
        </div>
      </div>
      <Chips
        label="Which places"
        value={scope.pool}
        onChange={(v) => set({ pool: v })}
        options={[["checked", "Agent picks"], ["checked-all", "+ ones it didn't pick"], ["everything", "Everything found (incl. unchecked)"]]}
      />
      <Chips
        label={`My votes (${voter})`}
        value={scope.mine}
        onChange={(v) => set({ mine: v })}
        options={[["unvoted", `Not voted (${status.mine.unvoted ?? 0})`], ["like", `♥ ${status.mine.like ?? 0}`], ["maybe", `? ${status.mine.maybe ?? 0}`], ["nope", `✕ ${status.mine.nope ?? 0}`], ["never", `⛔ ${status.mine.never ?? 0}`], ["any", "All"]]}
      />
      {others.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">Someone else&apos;s votes</div>
          <div className="flex flex-wrap items-center gap-1">
            <select value={scope.other} onChange={(e) => set({ other: e.target.value })} className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm">
              <option value="">anyone — ignore</option>
              {others.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {scope.other && (
              <select value={scope.otherStatus} onChange={(e) => set({ otherStatus: e.target.value as ScopeUi["otherStatus"] })} className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm">
                <option value="voted">has voted on</option>
                <option value="like">liked</option>
                <option value="unvoted">hasn&apos;t voted on</option>
              </select>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-neutral-500">
        {status.left} to swipe · {status.inArea} places in this area · {status.index}
      </p>
    </div>
  );
}
