"use client";
import { useState } from "react";
import type { EntryDto } from "../domain/types";
import { LS, lsGet, lsSet } from "./client";
import { groupByCategory, type Ctx } from "./App";
import { EditSheet } from "./Plan";

function sortForShop(items: EntryDto[]) {
  // Still to buy first (stable by name), crossed-out sink to the bottom of the section.
  return items.slice().sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, "lt") : a.status === "OPEN" ? -1 : 1));
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

  const toggle = (e: EntryDto) => {
    if (navigator.vibrate) navigator.vibrate(10);
    ctx.patch(e.id, { status: e.status === "BOUGHT" ? "OPEN" : "BOUGHT" });
  };

  const rows = (items: EntryDto[]) =>
    groupByCategory(hideBought ? items.filter((e) => e.status === "OPEN") : items, ctx.categories).map(({ cat, items: xs }) => (
      <div key={cat.id} className="group shopgroup">
        <h4>{cat.emoji} {ctx.catName(cat.id)}</h4>
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
