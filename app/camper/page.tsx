"use client";

// Remote control of the camper from anywhere. A thin layer: everything shown here
// comes from the Z1's own description of its devices (state.devices: readings,
// controls with ranges/options, actions), so a device added on the Z1 appears
// here without changes. Commands go through /api/camper/commands:
//   {action:"set", device, control, value}   manual write, checked on the Z1
//   {action:"act", device, id, params}       one-tap action (e.g. run diesel 1 h)
// Auth: MapPal login, or the token opened once as /camper#t=<token> (kept in this browser).
import { useCallback, useEffect, useState } from "react";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Opt = { value: string; label: string };
type Reading = { id: string; label: string; value: unknown; unit: string | null; log: boolean };
type Control = { id: string; label: string; type: "toggle" | "number" | "choice"; value: unknown; raw: boolean; min?: number; max?: number; step?: number; unit?: string; options?: Opt[] };
type Action = { id: string; label: string; active: boolean; params: Control[] };
type Device = { id: string; name: string; kind: string; online: boolean; status: string; manual: boolean | null; note: string | null; readings: Reading[]; controls: Control[]; actions: Action[] };
type Send = (label: string, body: Any) => void;

const C = { bg: "#0A0C0F", card: "#13161B", line: "#232931", ink: "#EDF0F3", mute: "#98A2AD", amber: "#FFB547", orange: "#FF8A3D", blue: "#5CC8FF", teal: "#6FE3C9", red: "#FF6A5A", green: "#7FE0A4" };
const KIND_COLOR: Record<string, string> = { rules: C.ink, thermostat: C.amber, ac: C.blue, heater: C.orange, victron: C.teal, phone: C.mute };
const PALETTE = ["#EDF0F3", "#5CC8FF", "#FFB547", "#FF8A3D", "#6FE3C9", "#B9AEFF", "#7FE0A4", "#FF6A5A", "#E6D27A", "#98A2AD"];

const fmt = (v: unknown, unit?: string | null) => {
  if (v === null || v === undefined) return "–";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return `${Number.isInteger(v) ? v : v.toFixed(unit === "V" ? 2 : 1)}${unit ? (unit.startsWith("°") ? unit : ` ${unit}`) : ""}`;
  return String(v);
};
const hhmm = (t: number, withDay = false) => new Date(t * 1000).toLocaleString(undefined, withDay ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });

function ago(iso: string | null, now: number) {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

function Btn({ label, onClick, color = C.ink, on = false, small = false }: { label: string; onClick: () => void; color?: string; on?: boolean; small?: boolean }) {
  return (
    <button onClick={onClick} style={{ height: small ? 34 : 44, padding: small ? "0 10px" : "0 14px", borderRadius: 12, fontSize: small ? 13 : 15, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${on ? color : C.line}`, background: on ? `${color}26` : "#171B21", color: on ? color : C.ink }}>{label}</button>
  );
}

const selectStyle = { height: 44, borderRadius: 12, background: "#171B21", color: C.ink, border: `1px solid ${C.line}`, padding: "0 8px", fontSize: 15 };

// ---------- one control, drawn from its description ----------

function NumberInput({ c, color, onSet }: { c: Control; color: string; onSet: (v: number) => void }) {
  const cur = typeof c.value === "number" ? c.value : null;
  const [text, setText] = useState<string | null>(null);
  const step = c.step ?? 1;
  const clamp = (v: number) => Math.min(c.max ?? Infinity, Math.max(c.min ?? -Infinity, Math.round(v / step) * step));
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(",", "."));
    setText(null);
    if (Number.isFinite(v) && v !== cur) onSet(clamp(v));
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Btn label={`−${step}`} small onClick={() => cur !== null && onSet(clamp(cur - step))} />
      <input inputMode="decimal" value={text ?? (cur === null ? "" : String(cur))} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        style={{ width: 64, height: 34, borderRadius: 10, border: `1px solid ${color}`, background: C.card, color: C.ink, textAlign: "center", fontSize: 15 }} />
      <Btn label={`+${step}`} small onClick={() => cur !== null && onSet(clamp(cur + step))} />
      <span style={{ fontSize: 12, color: C.mute }}>{c.unit ?? ""} {c.min ?? "…"}–{c.max ?? "…"}</span>
    </div>
  );
}

function ControlRow({ d, c, color, send }: { d: Device; c: Control; color: string; send: Send }) {
  const set = (value: unknown, label: string) => send(`${d.name}: ${c.label} ${label}`, { action: "set", device: d.id, control: c.id, value });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ width: 96, fontSize: 13, color: C.mute }}>{c.label}</div>
      {c.type === "toggle" && <>
        <Btn label="On" small on={c.value === true} color={color} onClick={() => set(true, "on")} />
        <Btn label="Off" small on={c.value === false} onClick={() => set(false, "off")} />
      </>}
      {c.type === "choice" && (c.options ?? []).map((o) => <Btn key={o.value} label={o.label} small on={c.value === o.value} color={color} onClick={() => set(o.value, o.label)} />)}
      {c.type === "number" && <NumberInput c={c} color={color} onSet={(v) => set(v, fmt(v, c.unit))} />}
    </div>
  );
}

function ActionRow({ d, a, color, send }: { d: Device; a: Action; color: string; send: Send }) {
  const [params, setParams] = useState<Record<string, string>>(() => Object.fromEntries(a.params.map((p) => [p.id, String(p.value ?? p.options?.[0]?.value ?? "")])));
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {a.params.map((p) => (
        <select key={p.id} aria-label={p.label} value={params[p.id]} onChange={(e) => setParams({ ...params, [p.id]: e.target.value })} style={selectStyle}>
          {(p.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      <Btn label={a.label} on={a.active} color={color} onClick={() => send(`${d.name}: ${a.label}`, { action: "act", device: d.id, id: a.id, params })} />
    </div>
  );
}

function DeviceCard({ d, send }: { d: Device; send: Send }) {
  const [open, setOpen] = useState(false);
  const color = KIND_COLOR[d.kind] ?? C.ink;
  const raw = d.controls.filter((c) => c.raw), settings = d.controls.filter((c) => !c.raw);
  const shown = d.readings.filter((r) => r.value !== null && r.value !== undefined);
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10, opacity: d.online ? 1 : 0.7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {d.name}
          {d.manual !== null && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: d.manual ? "#2A1E10" : "#12291C", color: d.manual ? C.amber : C.green }}>{d.manual ? "manual" : "rules"}</span>}
        </div>
        <div style={{ fontSize: 14, color: d.online ? color : C.red, textAlign: "right" }}>{d.status}</div>
      </div>
      {shown.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13 }}>
          {shown.map((r) => <span key={r.id}><span style={{ color: C.mute }}>{r.label}</span> {fmt(r.value, r.unit)}</span>)}
        </div>
      )}
      {d.actions.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{d.actions.map((a) => <ActionRow key={`${a.id}-${a.params.length}`} d={d} a={a} color={color} send={send} />)}</div>}
      {(raw.length > 0 || settings.length > 0) && (
        <button onClick={() => setOpen(!open)} style={{ background: "none", border: 0, color: C.mute, fontSize: 13, textAlign: "left", padding: 0, cursor: "pointer" }}>
          {open ? "▾" : "▸"} {raw.length ? "Manual control" : "Settings"}{raw.length && settings.length ? " & settings" : ""}
        </button>
      )}
      {open && <>
        {raw.length > 0 && <div style={{ fontSize: 12, color: C.mute }}>Writes go straight to the device; the app&apos;s rules let go of it until you pick a preset again.</div>}
        {raw.map((c) => <ControlRow key={c.id} d={d} c={c} color={color} send={send} />)}
        {settings.map((c) => <ControlRow key={c.id} d={d} c={c} color={color} send={send} />)}
      </>}
    </section>
  );
}

// ---------- history: series from the same descriptions ----------

type Series = { key: string; label: string; unit: string; color: string; band: boolean; defaultOn: boolean };

function seriesFrom(devices: Device[]): Series[] {
  const out: Series[] = [];
  let i = 0;
  for (const d of devices) {
    for (const r of d.readings) {
      if (typeof r.value === "boolean") out.push({ key: `${d.id}.${r.id}`, label: `${d.name} · ${r.label}`, unit: "", color: KIND_COLOR[d.kind] ?? C.ink, band: true, defaultOn: d.kind !== "phone" });
      else if (r.log && r.unit && typeof r.value === "number") out.push({ key: `${d.id}.${r.id}`, label: `${d.name} · ${r.label}`, unit: r.unit, color: PALETTE[i++ % PALETTE.length], band: false, defaultOn: d.kind !== "phone" });
    }
    for (const c of d.controls) {
      if (c.type === "toggle") out.push({ key: `${d.id}.${c.id}`, label: `${d.name} · ${c.label}`, unit: "", color: KIND_COLOR[d.kind] ?? C.ink, band: true, defaultOn: true });
      else if (c.type === "number" && c.raw) out.push({ key: `${d.id}.${c.id}`, label: `${d.name} · ${c.label}`, unit: c.unit ?? "", color: PALETTE[i++ % PALETTE.length], band: false, defaultOn: false });
    }
  }
  return out;
}

const UNIT_ORDER = ["°C", "V", "A", "W", "kWh", "%"];

function Chart({ samples, lines, bands, unit, from, to }: { samples: Any[]; lines: Series[]; bands: Series[]; unit: string; from: number; to: number }) {
  const W = 520, H = 150 + bands.length * 10, P = { l: 34, r: 8, t: 8, b: 18 };
  const bandH = 7, plotB = H - P.b - bands.length * (bandH + 3);
  const vals = samples.flatMap((r) => lines.map((l) => r[l.key])).filter((v): v is number => typeof v === "number");
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const x = (t: number) => P.l + ((t - from) / (to - from)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (plotB - P.t);
  const path = (k: string) => {
    let d = "", prevT = 0;
    for (const r of samples) {
      const v = r[k];
      if (typeof v !== "number") { prevT = 0; continue; }
      d += `${!prevT || r.t - prevT > 900 ? "M" : "L"}${x(r.t).toFixed(1)},${y(v).toFixed(1)}`;
      prevT = r.t;
    }
    return d;
  };
  const span = to - from, step = span > 3 * 86400 ? 86400 : span > 86400 ? 6 * 3600 : span > 8 * 3600 ? 3 * 3600 : 3600;
  const xt: number[] = [];
  for (let t = Math.ceil(from / step) * step; t < to; t += step) xt.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {lines.length > 0 && [lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={C.line} /><text x={P.l - 4} y={y(v) + 4} fontSize={10} fill={C.mute} textAnchor="end">{v.toFixed(unit === "V" ? 1 : 0)}</text></g>)}
      {lines.length > 0 && <text x={W - P.r} y={P.t + 8} fontSize={10} fill={C.mute} textAnchor="end">{unit}</text>}
      {xt.map((t) => <text key={t} x={x(t)} y={H - 4} fontSize={10} fill={C.mute} textAnchor="middle">{hhmm(t, span > 86400 * 1.5)}</text>)}
      {lines.map((l) => <path key={l.key} d={path(l.key)} fill="none" stroke={l.color} strokeWidth={1.8} />)}
      {bands.map((b, i) => {
        const yb = plotB + 4 + i * (bandH + 3);
        return <g key={b.key}>
          <rect x={P.l} y={yb} width={W - P.l - P.r} height={bandH} fill="#171B21" rx={2} />
          {samples.filter((r) => r[b.key] === true).map((r) => <rect key={r.t} x={x(r.t)} y={yb} width={Math.max(1, x(r.t + 300) - x(r.t))} height={bandH} fill={b.color} />)}
          <text x={P.l - 4} y={yb + bandH - 1} fontSize={8} fill={b.color} textAnchor="end">{b.label.split(" · ")[0].slice(0, 7)}</text>
        </g>;
      })}
    </svg>
  );
}

function History({ call, devices }: { call: (path: string) => Promise<Any>; devices: Device[] }) {
  const [hours, setHours] = useState(24);
  const [h, setH] = useState<Any | null>(null);
  const [allEvents, setAllEvents] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("camperSeries") ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    let live = true;
    const go = () => call(`/api/camper/history?hours=${hours}`).then((r) => live && setH(r)).catch(() => {});
    go();
    const every = setInterval(go, 5 * 60_000);
    return () => { live = false; clearInterval(every); };
  }, [call, hours]);
  const toggle = (k: string, on: boolean) => {
    const next = { ...picked, [k]: !on };
    setPicked(next);
    try { localStorage.setItem("camperSeries", JSON.stringify(next)); } catch {}
  };

  const series = seriesFrom(devices);
  const isOn = (s: Series) => picked[s.key] ?? s.defaultOn;
  const to: number = h?.now ?? 0, from = to - hours * 3600;
  const samples: Any[] = h?.samples ?? [];
  const rank = (u: string) => (UNIT_ORDER.includes(u) ? UNIT_ORDER.indexOf(u) : 99);
  const units = [...new Set(series.filter((s) => !s.band).map((s) => s.unit))].sort((a, b) => rank(a) - rank(b));
  const bands = series.filter((s) => s.band && isOn(s));
  const names: Record<string, string> = Object.fromEntries(devices.flatMap((d) =>
    [...d.readings, ...d.controls].map((x) => [`${d.id}.${x.id}`, `${d.name} · ${x.label}`] as const).concat([[`${d.id}.online`, `${d.name} · online`] as const])));
  const events: Any[] = (h?.events ?? []).filter((e: Any) => allEvents || !/^-?\d+(\.\d+)?$/.test(e.value ?? ""));

  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>History</div>
        <div style={{ display: "flex", gap: 6 }}>{[6, 24, 72, 168].map((v) => <Btn key={v} small label={v < 48 ? `${v} h` : `${v / 24} d`} on={hours === v} onClick={() => setHours(v)} />)}</div>
      </div>
      {!h ? <div style={{ color: C.mute, fontSize: 13 }}>Loading…</div> : !samples.length ? <div style={{ color: C.mute, fontSize: 13 }}>No samples in this range yet (one every 5 min).</div> : units.map((u, i) => {
        const lines = series.filter((s) => !s.band && s.unit === u && isOn(s));
        if (!lines.length && i > 0) return null;
        return <Chart key={u} samples={samples} unit={u} from={from} to={to} lines={lines} bands={i === 0 ? bands : []} />;
      })}
      <details>
        <summary style={{ fontSize: 13, color: C.mute, cursor: "pointer" }}>Choose lines</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {series.map((s) => (
            <button key={s.key} onClick={() => toggle(s.key, isOn(s))} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, cursor: "pointer", border: `1px solid ${isOn(s) ? s.color : C.line}`, background: "#171B21", color: isOn(s) ? s.color : C.mute }}>
              {s.band ? "▬ " : "━ "}{s.label}{s.unit ? ` (${s.unit})` : ""}
            </button>
          ))}
        </div>
      </details>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Events</div>
        <label style={{ fontSize: 12, color: C.mute }}><input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} /> include number changes</label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
        {events.length ? events.slice(0, 300).map((e: Any, i: number) => {
          const v = e.value === "true" ? "on" : e.value === "false" ? "off" : e.value;
          const text = e.device === "command" ? `${e.by === "remote" ? "Remote" : "Screen"}: ${e.what} ${v ?? ""}` : `${names[`${e.device}.${e.what}`] ?? `${e.device} ${e.what}`} → ${v}`;
          return (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 13 }}>
              <span style={{ color: C.mute, minWidth: 92 }}>{hhmm(e.t, true)}</span>
              <span style={{ color: e.device === "command" ? C.mute : KIND_COLOR[devices.find((d) => d.id === e.device)?.kind ?? ""] ?? C.ink }}>{text}</span>
            </div>
          );
        }) : <div style={{ color: C.mute, fontSize: 13 }}>No events in this range.</div>}
      </div>
    </section>
  );
}

// ---------- rules: stored and evaluated on the Z1, edited here ----------

type Field = { id: string; label: string; kind: "number" | "bool" | "choice" | "text"; unit?: string | null; options?: Opt[]; min?: number; max?: number; step?: number; value: unknown };
type Cond = { device?: string; field?: string; op?: string; value?: unknown; time?: { from: string; to: string } };
type Act = { device: string; control?: string; value?: unknown; action?: string; params?: Record<string, string> };
type Rule = { id?: string; name: string; enabled: boolean; when: Cond[]; then: Act[]; for_min: number; cooldown_min: number;
  holds?: boolean; waiting_min?: number | null; fired?: boolean; last_fired?: number | null; last_result?: string | null };

function fieldsOf(d?: Device): Field[] {
  if (!d) return [];
  const out: Field[] = [];
  for (const r of d.readings) out.push({ id: r.id, label: r.label, unit: r.unit, value: r.value,
    kind: typeof r.value === "number" ? "number" : typeof r.value === "boolean" ? "bool" : "text" });
  for (const c of d.controls) out.push({ id: c.id, label: c.label, unit: c.unit, value: c.value, options: c.options, min: c.min, max: c.max, step: c.step,
    kind: c.type === "toggle" ? "bool" : c.type === "number" ? "number" : "choice" });
  out.push({ id: "online", label: "Online", kind: "bool", value: d.online });
  return out;
}

const inputStyle = { height: 36, borderRadius: 10, border: `1px solid ${C.line}`, background: "#171B21", color: C.ink, padding: "0 8px", fontSize: 14 };
const smallSelect = { ...inputStyle, maxWidth: 200 };

/** A value picker for one field/control: number box, on/off, or its options. */
function ValueInput({ f, value, onChange }: { f?: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (!f) return null;
  if (f.kind === "bool") return (
    <select value={value === true ? "true" : "false"} onChange={(e) => onChange(e.target.value === "true")} style={smallSelect}>
      <option value="true">on</option><option value="false">off</option>
    </select>
  );
  if (f.kind === "choice") return (
    <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={smallSelect}>
      <option value="" disabled>pick…</option>
      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  if (f.kind === "number") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input type="number" value={typeof value === "number" ? value : ""} min={f.min} max={f.max} step={f.step ?? "any"}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 80 }} />
      <span style={{ fontSize: 12, color: C.mute }}>{f.unit ?? ""}{f.min !== undefined ? ` ${f.min}–${f.max}` : ""}</span>
    </span>
  );
  return <input value={String(value ?? "")} placeholder={f.value != null ? `now: ${f.value}` : ""} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, width: 130 }} />;
}

function DeviceSelect({ devices, value, onChange, filter }: { devices: Device[]; value?: string; onChange: (v: string) => void; filter?: (d: Device) => boolean }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={smallSelect}>
      <option value="" disabled>device…</option>
      {devices.filter(filter ?? (() => true)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );
}

function describeRule(r: Rule, devices: Device[]) {
  const dev = (id?: string) => devices.find((d) => d.id === id);
  const fld = (c: Cond) => fieldsOf(dev(c.device)).find((f) => f.id === c.field);
  const val = (f: Field | undefined, v: unknown) => f?.kind === "choice" ? f.options?.find((o) => o.value === v)?.label ?? String(v) : fmt(v, f?.unit);
  const when = r.when.map((c) => c.time ? `${c.time.from}–${c.time.to}` : `${dev(c.device)?.name ?? c.device} ${fld(c)?.label ?? c.field} ${c.op} ${val(fld(c), c.value)}`).join(" and ");
  const then = r.then.map((a) => {
    const d = dev(a.device);
    if (a.control) { const c = d?.controls.find((x) => x.id === a.control); return `${d?.name ?? a.device}: ${c?.label ?? a.control} → ${val(c ? fieldsOf(d).find((f) => f.id === c.id) : undefined, a.value)}`; }
    const ac = d?.actions.find((x) => x.id === a.action);
    const ps = Object.entries(a.params ?? {}).map(([k, v]) => ac?.params.find((p) => p.id === k)?.options?.find((o) => o.value === v)?.label ?? v).join(" ");
    return `${d?.name ?? a.device}: ${ac?.label ?? a.action}${ps ? ` (${ps})` : ""}`;
  }).join(", ");
  return `When ${when}${r.for_min ? ` for ${r.for_min} min` : ""} → ${then}`;
}

/** Every action any device offers in any state (devices only list the ones available right now). */
function allActions(d?: Device): Action[] {
  return d?.actions ?? [];
}

function RuleEditor({ initial, devices, onSave, onCancel }: { initial: Rule; devices: Device[]; onSave: (r: Rule) => void; onCancel: () => void }) {
  const [r, setR] = useState<Rule>(initial);
  const dev = (id?: string) => devices.find((d) => d.id === id);
  const setCond = (i: number, c: Cond) => setR({ ...r, when: r.when.map((x, j) => (j === i ? c : x)) });
  const setAct = (i: number, a: Act) => setR({ ...r, then: r.then.map((x, j) => (j === i ? a : x)) });
  const row = { display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      <input value={r.name} placeholder="Rule name, e.g. Low battery: AC off" onChange={(e) => setR({ ...r, name: e.target.value })} style={{ ...inputStyle, width: "100%" }} />

      <div style={{ fontSize: 13, fontWeight: 600, color: C.mute }}>WHEN (all of these)</div>
      {r.when.map((c, i) => (
        <div key={i} style={row}>
          {c.time ? <>
            <span style={{ fontSize: 13 }}>Time between</span>
            <input type="time" value={c.time.from} onChange={(e) => setCond(i, { time: { ...c.time!, from: e.target.value } })} style={inputStyle} />
            <span style={{ fontSize: 13 }}>and</span>
            <input type="time" value={c.time.to} onChange={(e) => setCond(i, { time: { ...c.time!, to: e.target.value } })} style={inputStyle} />
          </> : (() => {
            const fields = fieldsOf(dev(c.device)), f = fields.find((x) => x.id === c.field);
            const ops = f?.kind === "number" ? ["<", "<=", ">", ">=", "==", "!="] : ["==", "!="];
            return <>
              <DeviceSelect devices={devices} value={c.device} onChange={(v) => setCond(i, { device: v, op: "==" })} />
              <select value={c.field ?? ""} onChange={(e) => { const nf = fields.find((x) => x.id === e.target.value); setCond(i, { ...c, field: e.target.value, op: nf?.kind === "number" ? "<" : "==", value: nf?.value ?? null }); }} style={smallSelect}>
                <option value="" disabled>value…</option>
                {fields.map((x) => <option key={x.id} value={x.id}>{x.label}{x.unit ? ` (${x.unit})` : ""}</option>)}
              </select>
              {f && <select value={c.op} onChange={(e) => setCond(i, { ...c, op: e.target.value })} style={{ ...inputStyle, width: 56 }}>{ops.map((o) => <option key={o}>{o}</option>)}</select>}
              <ValueInput f={f} value={c.value} onChange={(v) => setCond(i, { ...c, value: v })} />
            </>;
          })()}
          <Btn small label="✕" onClick={() => setR({ ...r, when: r.when.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <div style={row}>
        <Btn small label="+ Condition" onClick={() => setR({ ...r, when: [...r.when, { op: "<" }] })} />
        <Btn small label="+ Time window" onClick={() => setR({ ...r, when: [...r.when, { time: { from: "22:00", to: "07:00" } }] })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 13 }}>for at least</span>
        <input type="number" min={0} value={r.for_min} onChange={(e) => setR({ ...r, for_min: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 70 }} />
        <span style={{ fontSize: 13 }}>min · then wait at least</span>
        <input type="number" min={0} value={r.cooldown_min} onChange={(e) => setR({ ...r, cooldown_min: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 70 }} />
        <span style={{ fontSize: 13 }}>min before firing again</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: C.mute }}>THEN</div>
      {r.then.map((a, i) => {
        const d = dev(a.device);
        const target = a.control ? `c:${a.control}` : a.action ? `a:${a.action}` : "";
        const ctl = d?.controls.find((x) => x.id === a.control);
        const act = allActions(d).find((x) => x.id === a.action);
        return (
          <div key={i} style={row}>
            <DeviceSelect devices={devices} value={a.device} onChange={(v) => setAct(i, { device: v })} filter={(x) => x.controls.length + x.actions.length > 0} />
            <select value={target} onChange={(e) => {
              const [k, id] = [e.target.value.slice(0, 1), e.target.value.slice(2)];
              if (k === "c") setAct(i, { device: a.device, control: id, value: d?.controls.find((x) => x.id === id)?.value ?? null });
              else { const ac = allActions(d).find((x) => x.id === id); setAct(i, { device: a.device, action: id, params: Object.fromEntries((ac?.params ?? []).map((p) => [p.id, String(p.value ?? "")])) }); }
            }} style={smallSelect}>
              <option value="" disabled>do…</option>
              {(d?.controls ?? []).map((c) => <option key={c.id} value={`c:${c.id}`}>Set {c.label}</option>)}
              {allActions(d).map((x) => <option key={x.id} value={`a:${x.id}`}>{x.label}</option>)}
            </select>
            {ctl && <ValueInput f={fieldsOf(d).find((f) => f.id === ctl.id)} value={a.value} onChange={(v) => setAct(i, { ...a, value: v })} />}
            {act?.params.map((p) => (
              <select key={p.id} value={a.params?.[p.id] ?? ""} onChange={(e) => setAct(i, { ...a, params: { ...a.params, [p.id]: e.target.value } })} style={smallSelect}>
                {(p.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            <Btn small label="✕" onClick={() => setR({ ...r, then: r.then.filter((_, j) => j !== i) })} />
          </div>
        );
      })}
      <div style={row}><Btn small label="+ Action" onClick={() => setR({ ...r, then: [...r.then, { device: "" }] })} /></div>
      <div style={{ fontSize: 12, color: C.mute }}>Only actions a device offers right now are listed (e.g. the diesel shows Run while it&apos;s off). Values are checked on the camper when the rule is saved and again when it runs.</div>
      <div style={row}>
        <Btn label="Save rule" color={C.green} on onClick={() => onSave(r)} />
        <Btn label="Cancel" onClick={onCancel} />
      </div>
    </div>
  );
}

function RulesPanel({ rules, devices, send }: { rules: Rule[]; devices: Device[]; send: Send }) {
  const [editing, setEditing] = useState<Rule | null>(null);
  const strip = (r: Rule): Rule => ({ id: r.id, name: r.name, enabled: r.enabled, when: r.when, then: r.then, for_min: r.for_min, cooldown_min: r.cooldown_min });
  const save = (r: Rule) => { send(`Save rule “${r.name}”`, { action: "rule_save", rule: strip(r) }); setEditing(null); };
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Rules <span style={{ fontSize: 13, color: C.mute, fontWeight: 400 }}>· run on the camper, also offline</span></div>
        {!editing && <Btn small label="+ New rule" onClick={() => setEditing({ name: "", enabled: true, when: [{ op: "<" }], then: [{ device: "" }], for_min: 5, cooldown_min: 30 })} />}
      </div>
      {!rules.length && !editing && <div style={{ fontSize: 13, color: C.mute }}>No rules yet. Example: when Solar · Battery &lt; 12.4 V for 5 min → Air conditioner: Power off.</div>}
      {rules.map((r) => (
        <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 8, opacity: r.enabled ? 1 : 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: r.last_result && r.last_result !== "ok" ? C.red : r.holds ? C.amber : C.mute, textAlign: "right" }}>
              {!r.enabled ? "off" : r.fired ? "fired" : r.holds ? `true · waiting ${r.waiting_min ?? 0}/${r.for_min} min` : "armed"}
              {r.last_fired ? ` · last ${hhmm(r.last_fired, true)}${r.last_result && r.last_result !== "ok" ? `: ${r.last_result}` : ""}` : ""}
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.mute }}>{describeRule(r, devices)}</div>
          {editing && editing.id === r.id ? <RuleEditor initial={editing} devices={devices} onSave={save} onCancel={() => setEditing(null)} /> : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn small label="Edit" onClick={() => setEditing(r)} />
              <Btn small label={r.enabled ? "Turn off" : "Turn on"} onClick={() => send(`${r.enabled ? "Disable" : "Enable"} “${r.name}”`, { action: "rule_save", rule: { ...strip(r), enabled: !r.enabled } })} />
              <Btn small label="Run now" onClick={() => send(`Run “${r.name}”`, { action: "rule_run", id: r.id })} />
              <Btn small label="Delete" onClick={() => confirm(`Delete rule “${r.name}”?`) && send(`Delete “${r.name}”`, { action: "rule_delete", id: r.id })} />
            </div>
          )}
        </div>
      ))}
      {editing && !editing.id && <RuleEditor initial={editing} devices={devices} onSave={save} onCancel={() => setEditing(null)} />}
    </section>
  );
}

// ---------- page ----------

export default function CamperPage() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("t");
    if (fromHash) { localStorage.setItem("camperToken", fromHash); history.replaceState(null, "", location.pathname); }
    return fromHash ?? localStorage.getItem("camperToken");
  });
  const [data, setData] = useState<Any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needToken, setNeedToken] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetch(path, { ...init, headers, cache: "no-store" });
    if (r.status === 401) { setNeedToken(true); throw new Error("Not allowed"); }
    return r.json();
  }, [token]);
  const getJson = useCallback((path: string) => call(path), [call]);

  const load = useCallback(async () => {
    try { setData(await call("/api/camper/state")); setError(null); } catch (e) { setError((e as Error).message); }
  }, [call]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = setInterval(load, 4000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [load]);

  const send: Send = async (label, body) => {
    setBusy(label);
    try {
      const r = await call("/api/camper/commands", { method: "POST", body: JSON.stringify(body) });
      if (r.error) setError(r.error);
      await load();
    } catch (e) { setError((e as Error).message); }
    setTimeout(() => setBusy(null), 8000);
  };

  if (needToken) {
    return (
      <main style={{ minHeight: "100vh", background: C.bg, color: C.ink, padding: 20, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22 }}>Camper</h1>
        <p style={{ color: C.mute }}>Log in to MapPal, or paste the camper token once.</p>
        <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value.trim(); localStorage.setItem("camperToken", v); setToken(v); setNeedToken(false); }}>
          <input name="t" placeholder="token" style={{ width: "100%", height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, color: C.ink, padding: "0 12px" }} />
        </form>
      </main>
    );
  }

  const s: Any | null = data?.state ?? null;
  const now = data?.now ? new Date(data.now).getTime() : 0;
  const age = data?.updatedAt ? (now - new Date(data.updatedAt).getTime()) / 1000 : Infinity;
  const live = age < 90;
  const last = data?.commands?.[0];
  const devices: Device[] = s?.devices ?? [];

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.ink, padding: "18px 14px 40px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Camper</h1>
        <span style={{ fontSize: 13, fontWeight: 600, padding: "5px 10px", borderRadius: 999, background: live ? "#12291C" : "#2A1E10", color: live ? C.green : C.amber }}>
          {live ? "Live" : "Offline"} · {ago(data?.updatedAt ?? null, now)}
        </span>
      </header>
      {error && <div style={{ color: C.red, fontSize: 14 }}>{error}</div>}
      {busy && <div style={{ color: C.mute, fontSize: 14 }}>Sent “{busy}”{last?.ok === false ? ` · failed: ${last.error}` : last?.ok ? " · done" : " · waiting for the camper…"}</div>}
      {!s ? <p style={{ color: C.mute }}>No data from the camper yet.</p> : !devices.length ? <p style={{ color: C.mute }}>The camper app ({s.app}) doesn&apos;t describe its devices yet; update it to 1.15 or later.</p> : (
        <>
          {(s.alerts ?? []).map((a: Any) => (
            <section key={a.id} style={{ background: "#211A12", border: `1px solid #4A3820`, borderRadius: 16, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div><div style={{ fontWeight: 600 }}>{a.text}</div><div style={{ fontSize: 13, color: "#CDB28C" }}>{a.sub}</div></div>
              {a.action && <Btn label={a.action} color={C.amber} onClick={() => send(a.action, a.id === "cleanout" ? { action: "diesel_cleanout" } : { action: "dismiss", id: a.id })} />}
            </section>
          ))}
          {s.weather && <div style={{ fontSize: 14, color: C.mute }}>{s.weather.now} · {s.weather.line} · tomorrow {s.weather.tomorrow?.label}</div>}
          {devices.map((d) => <DeviceCard key={d.id} d={d} send={send} />)}
          {Array.isArray(s.rules) && <RulesPanel rules={s.rules} devices={devices} send={send} />}
          <History call={getJson} devices={devices} />
        </>
      )}
    </main>
  );
}
