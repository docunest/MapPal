"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntryDto } from "../domain/types";
import { LS, lsGet, lsSet } from "./client";
import { groupByCategory, type Ctx } from "./App";
import { EditSheet } from "./Plan";

function sortForShop(items: EntryDto[]) {
  // Fixed order (owner: ticking must not move rows around): by name only.
  return items.slice().sort((a, b) => a.name.localeCompare(b.name, "lt") || a.id.localeCompare(b.id));
}

const AUTO_COLLAPSE_MS = 1200;

/**
 * Sections collapse by themselves ~1 s after their last item is ticked (so
 * the tick is seen first), and open again if something in them is un-ticked
 * or added. A tap on the header overrides that until the section's done state
 * changes again.
 */
function useSectionCollapse(entries: EntryDto[]) {
  const doneIds = useMemo(() => {
    const by = new Map<string, boolean>();
    for (const e of entries) by.set(e.categoryId, (by.get(e.categoryId) ?? true) && e.status === "BOUGHT");
    return [...by].filter(([, done]) => done).map(([id]) => id).sort();
  }, [entries]);
  const doneKey = doneIds.join(",");
  const [autoCollapsed, setAutoCollapsed] = useState<Set<string>>(() => new Set(doneIds));
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const prevDone = useRef(new Set(doneIds));
  useEffect(() => {
    const now = new Set(doneKey ? doneKey.split(",") : []);
    const t = setTimeout(() => {
      const changed = [...new Set([...now, ...prevDone.current])].filter((id) => now.has(id) !== prevDone.current.has(id));
      prevDone.current = now;
      setAutoCollapsed(now);
      if (changed.length) setOverrides((o) => { const n = new Map(o); changed.forEach((id) => n.delete(id)); return n; });
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [doneKey]);
  const isCollapsed = (id: string) => overrides.get(id) ?? autoCollapsed.has(id);
  const toggle = (id: string) => setOverrides((o) => new Map(o).set(id, !isCollapsed(id)));
  return { isCollapsed, toggle };
}

export function Shop({ ctx }: { ctx: Ctx }) {
  const [hideBought, setHideBought] = useState(() => lsGet(LS.hideBought) === "1");
  const [showLater, setShowLater] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<EntryDto | null>(null);
  const grocery = ctx.entries.filter((e) => e.kind === "GROCERY");
  const later = ctx.entries.filter((e) => e.kind === "LONGTERM");
  const bought = ctx.entries.filter((e) => e.status === "BOUGHT").length;
  const total = grocery.length;
  const boughtGrocery = grocery.filter((e) => e.status === "BOUGHT").length;
  const open = grocery.length - boughtGrocery;

  const sections = useSectionCollapse(ctx.entries);

  const toggle = (e: EntryDto) => {
    if (navigator.vibrate) navigator.vibrate(10);
    ctx.patch(e.id, { status: e.status === "BOUGHT" ? "OPEN" : "BOUGHT" });
  };

  const rows = (items: EntryDto[]) =>
    groupByCategory(hideBought ? items.filter((e) => e.status === "OPEN") : items, ctx.categories).map(({ cat, items: xs }) => (
      <div key={cat.id} className={`group shopgroup${sections.isCollapsed(cat.id) ? " collapsed" : ""}`}>
        <button className="sectionhead" onClick={() => sections.toggle(cat.id)} aria-expanded={!sections.isCollapsed(cat.id)}>
          <span className="chev">{sections.isCollapsed(cat.id) ? "▸" : "▾"}</span>
          <span>{cat.emoji} {ctx.catName(cat.id)}</span>
          <span className="count">
            {(() => {
              const all = ctx.entries.filter((e) => e.categoryId === cat.id);
              const done = all.filter((e) => e.status === "BOUGHT").length;
              return done === all.length ? `✓ ${done}` : `${done}/${all.length}`;
            })()}
          </span>
        </button>
        {sections.isCollapsed(cat.id) ? null : (
        <ul>
          {sortForShop(xs).map((e) => (
            <li key={e.id} className={e.status === "BOUGHT" ? "done" : ""}>
              <button className="shoprow" onClick={() => toggle(e)} onContextMenu={(ev) => { ev.preventDefault(); setEditing(e); }}>
                <span className="box">{e.status === "BOUGHT" ? "✓" : ""}</span>
                <span className="name">{e.name}</span>
                {e.qty ? <span className="qty">{e.qty}</span> : null}
                {e.note ? <span className="muted small note">{e.note}</span> : null}
                {e.status === "BOUGHT" && e.boughtBy && e.boughtBy !== ctx.member ? <span className="who">{e.boughtBy}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        )}
      </div>
    ));

  return (
    <div className="shop">
      <div className="progress">
        <div className="row between">
          <strong>{ctx.tr("bought")} {boughtGrocery} {ctx.tr("of")} {total}</strong>
          <label className="toggle small">
            <input type="checkbox" checked={hideBought} onChange={(e) => { setHideBought(e.target.checked); lsSet(LS.hideBought, e.target.checked ? "1" : "0"); }} />
            {ctx.tr("hideBought")}
          </label>
        </div>
        <div className="bar"><div style={{ width: total ? `${(boughtGrocery / total) * 100}%` : "0%" }} /></div>
      </div>

      {!open && !boughtGrocery ? <p className="empty">{ctx.tr("emptyShop")}</p> : null}
      {rows(grocery)}

      {later.length ? (
        <section className="later">
          <button className="link" onClick={() => setShowLater(!showLater)}>
            <h3>{showLater ? "▾" : "▸"} 📦 {ctx.tr("longTermShop")} · {later.filter((e) => e.status === "OPEN").length}</h3>
          </button>
          {showLater ? rows(later) : null}
        </section>
      ) : null}

      {bought || ctx.trip ? (
        <div className="finishbar">
          {!confirming ? (
            <button className="primary wide" onClick={() => setConfirming(true)}>✔ {ctx.tr("finish")}</button>
          ) : (
            <div className="confirm">
              <p>{ctx.tr("finishConfirm", { b: bought, c: open })}</p>
              <div className="row end">
                <button onClick={() => setConfirming(false)}>{ctx.tr("cancel")}</button>
                <button
                  className="primary"
                  onClick={() => {
                    ctx.finish();
                    setConfirming(false);
                    ctx.toast(ctx.tr("finished", { b: bought, c: open }));
                  }}
                >
                  {ctx.tr("finish")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {editing ? <EditSheet ctx={ctx} entry={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
