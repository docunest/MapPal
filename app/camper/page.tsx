"use client";

// Remote control of the camper from anywhere. Reads what the Z1 pushed to
// /api/camper/state and queues commands for it (/api/camper/commands); the Z1
// runs them within a few seconds. Auth: MapPal login, or the token opened once
// as /camper#t=<token> (kept in this browser).
import { useCallback, useEffect, useState } from "react";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const C = { bg: "#0A0C0F", card: "#13161B", line: "#232931", ink: "#EDF0F3", mute: "#98A2AD", amber: "#FFB547", orange: "#FF8A3D", blue: "#5CC8FF", teal: "#6FE3C9", red: "#FF6A5A" };
const deg = (v: unknown) => (typeof v === "number" ? `${v.toFixed(1)}°` : "–");

function ago(iso: string | null, now: number) {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

function Btn({ label, onClick, color = C.ink, on = false }: { label: string; onClick: () => void; color?: string; on?: boolean }) {
  return (
    <button onClick={onClick} style={{ height: 44, padding: "0 14px", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${on ? color : C.line}`, background: on ? `${color}26` : "#171B21", color: on ? color : C.ink }}>{label}</button>
  );
}

function Card({ title, status, color, children }: { title: string; status: string; color?: string; children?: React.ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 14, color: color ?? C.mute, textAlign: "right" }}>{status}</div>
      </div>
      {children && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>}
    </section>
  );
}

const DEV_COLOR: Record<string, string> = { floor: C.amber, ac: C.blue, diesel: C.orange, dial: C.ink, victron: C.teal, command: C.mute };
const hhmm = (t: number, withDay = false) => new Date(t * 1000).toLocaleString(undefined, withDay ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: "100%" }}>
      <div style={{ width: 70, fontSize: 13, color: C.mute }}>{label}</div>
      {children}
    </div>
  );
}

type Line = { key: string; label: string; color: string };

// Small dependency-free line chart: lines on top, on/off bands underneath.
function Chart({ samples, lines, bands, unit, from, to }: { samples: Any[]; lines: Line[]; bands?: Line[]; unit: string; from: number; to: number }) {
  const W = 520, H = 150, P = { l: 34, r: 8, t: 8, b: 18 };
  const bandH = 7, bandsH = (bands?.length ?? 0) * (bandH + 3);
  const vals = samples.flatMap((r) => lines.map((l) => r[l.key])).filter((v): v is number => typeof v === "number");
  if (!vals.length) return <div style={{ color: C.mute, fontSize: 13 }}>No data in this range yet.</div>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const x = (t: number) => P.l + ((t - from) / (to - from)) * (W - P.l - P.r);
  const plotB = H - P.b - bandsH;
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
  const ticks = [lo, (lo + hi) / 2, hi];
  const span = to - from, step = span > 3 * 86400 ? 86400 : span > 86400 ? 6 * 3600 : 3 * 3600;
  const xt: number[] = [];
  for (let t = Math.ceil(from / step) * step; t < to; t += step) xt.push(t);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={C.line} /><text x={P.l - 4} y={y(v) + 4} fontSize={10} fill={C.mute} textAnchor="end">{v.toFixed(unit === "V" ? 1 : 0)}</text></g>)}
        {xt.map((t) => <text key={t} x={x(t)} y={H - 4} fontSize={10} fill={C.mute} textAnchor="middle">{hhmm(t, span > 86400 * 1.5)}</text>)}
        {lines.map((l) => <path key={l.key} d={path(l.key)} fill="none" stroke={l.color} strokeWidth={1.8} />)}
        {bands?.map((b, i) => {
          const yb = plotB + 4 + i * (bandH + 3);
          return <g key={b.key}>
            <rect x={P.l} y={yb} width={W - P.l - P.r} height={bandH} fill="#171B21" rx={2} />
            {samples.filter((r) => r[b.key] === true).map((r) => <rect key={r.t} x={x(r.t)} y={yb} width={Math.max(1, x(r.t + 300) - x(r.t))} height={bandH} fill={b.color} />)}
            <text x={P.l - 4} y={yb + bandH - 1} fontSize={9} fill={b.color} textAnchor="end">{b.label}</text>
          </g>;
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.mute }}>
        {lines.map((l) => <span key={l.key}><span style={{ color: l.color }}>━</span> {l.label} {typeof samples.at(-1)?.[l.key] === "number" ? `${samples.at(-1)![l.key]}${unit}` : ""}</span>)}
      </div>
    </div>
  );
}

function eventText(e: Any) {
  const v = e.value === "true" ? "on" : e.value === "false" ? "off" : e.value;
  if (e.device === "command") return `${e.by === "remote" ? "Remote" : "Screen"}: ${e.what} ${v ?? ""}`;
  const names: Record<string, string> = { "floor.power": "Floor heating", "floor.heating": "Floor relay", "floor.setpoint": "Floor setpoint", "floor.mode": "Floor mode",
    "ac.power": "AC", "ac.mode": "AC mode", "ac.target": "AC target", "ac.fan": "AC fan", "diesel.running": "Diesel heater", "diesel.level": "Diesel level",
    "diesel.connected": "Diesel Bluetooth", "dial.position": "Dial", "dial.floor_mode": "Floor plan", "victron.charger_state": "Charger", "victron.solar_state": "Solar" };
  return `${names[`${e.device}.${e.what}`] ?? `${e.device} ${e.what}`} → ${v}`;
}

function History({ call }: { call: (path: string) => Promise<Any> }) {
  const [hours, setHours] = useState(24);
  const [h, setH] = useState<Any | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    const go = () => call(`/api/camper/history?hours=${hours}`).then((r) => live && setH(r)).catch(() => {});
    go();
    const every = setInterval(go, 5 * 60_000);
    return () => { live = false; clearInterval(every); };
  }, [call, hours]);
  const to: number = h?.now ?? 0, from = to - hours * 3600;
  const samples: Any[] = h?.samples ?? [];
  const events: Any[] = (h?.events ?? []).filter((e: Any) => all || !["setpoint", "heating", "level", "target"].includes(e.what));
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>History</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[6, 24, 72, 168].map((v) => <Btn key={v} label={v < 48 ? `${v} h` : `${v / 24} d`} on={hours === v} onClick={() => setHours(v)} />)}
        </div>
      </div>
      {!h ? <div style={{ color: C.mute, fontSize: 13 }}>Loading…</div> : <>
        <Chart samples={samples} unit="°" from={from} to={to}
          lines={[{ key: "inside", label: "Inside", color: C.ink }, { key: "outside", label: "Outside", color: C.blue }, { key: "floor_setpoint", label: "Floor set", color: "#7A5B2A" }, { key: "diesel_room", label: "Diesel sensor", color: C.orange }]}
          bands={[{ key: "floor_heating", label: "Floor", color: C.amber }, { key: "ac_on", label: "AC", color: C.teal }, { key: "diesel_on", label: "Diesel", color: C.orange }]} />
        <Chart samples={samples} unit=" V" from={from} to={to} lines={[{ key: "battery_v", label: "Battery", color: "#7FE0A4" }]} />
        <Chart samples={samples} unit=" W" from={from} to={to} lines={[{ key: "solar_w", label: "Solar", color: C.amber }]} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Events</div>
          <label style={{ fontSize: 12, color: C.mute }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> include setpoint/level/relay changes</label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
          {events.length ? events.slice(0, 300).map((e: Any, i: number) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 13 }}>
              <span style={{ color: C.mute, minWidth: 92 }}>{hhmm(e.t, true)}</span>
              <span style={{ color: DEV_COLOR[e.device] ?? C.ink }}>{eventText(e)}</span>
            </div>
          )) : <div style={{ color: C.mute, fontSize: 13 }}>No events in this range.</div>}
        </div>
      </>}
    </section>
  );
}

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
  const [dur, setDur] = useState(60);
  const [dryDur, setDryDur] = useState(60);
  const [raw, setRaw] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetch(path, { ...init, headers, cache: "no-store" });
    if (r.status === 401) { setNeedToken(true); throw new Error("Not allowed"); }
    return r.json();
  }, [token]);

  const load = useCallback(async () => {
    try { setData(await call("/api/camper/state")); setError(null); } catch (e) { setError((e as Error).message); }
  }, [call]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = setInterval(load, 4000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [load]);

  const send = async (label: string, ...bodies: Any[]) => {
    setBusy(label);
    try {
      for (const body of bodies) await call("/api/camper/commands", { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (e) { setError((e as Error).message); }
    setTimeout(() => setBusy(null), 6000);
  };
  const getJson = useCallback((path: string) => call(path), [call]);

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
  const t = s?.temps ?? {};
  const floor = s?.floor, ac = s?.ac, d = s?.diesel, hs = d?.status;
  const pos = s?.position ?? s?.inferred_position;
  const last = data?.commands?.[0];
  const dieselStatus = !d?.connected ? `Not connected${d?.note ? ` · ${d.note}` : ""}`
    : !hs?.running ? "Off" : `${hs.step === "running" ? `Level ${hs.level}` : hs.step}${d.phase === "run" ? (d.until_off ? " · until off" : ` · ${d.minutes_left} min left`) : d.phase === "clean_stop" ? ` · clean stop ${d.minutes_left} min` : d.phase === "cleanout" ? ` · clean-out ${d.minutes_left} min` : ""}`;

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.ink, padding: "18px 14px 40px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Camper</h1>
        <span style={{ fontSize: 13, fontWeight: 600, padding: "5px 10px", borderRadius: 999, background: live ? "#12291C" : "#2A1E10", color: live ? "#7FE0A4" : C.amber }}>
          {live ? "Live" : "Offline"} · {ago(data?.updatedAt ?? null, now)}
        </span>
      </header>
      {error && <div style={{ color: C.red, fontSize: 14 }}>{error}</div>}
      {busy && <div style={{ color: C.mute, fontSize: 14 }}>Sent “{busy}”{last?.ok === false ? ` · failed: ${last.error}` : last?.ok ? " · done" : " · waiting for the camper…"}</div>}
      {!s ? <p style={{ color: C.mute }}>No data from the camper yet.</p> : (
        <>
          <Card title="Inside" status={`${deg(t.calibrated)} · thermostat ${deg(t.thermostat)} · AC ${deg(t.ac)}`} color={C.ink} />
          {s.weather && <Card title="Weather" status={`${s.weather.now} · ${s.weather.line} · tomorrow ${s.weather.tomorrow?.label}`} />}

          <Card title="Floor heating" color={floor?.power ? C.amber : C.mute}
            status={!floor ? "not responding" : !floor.power ? "Off" : `${s.floor_mode === "on" ? "On" : "Auto"} ${s.floor_target}° · ${floor.heating ? "heating" : "idle"}`}>
            <Btn label="Heat" on={pos === "floor" || pos === "diesel" || pos === "max"} color={C.amber} onClick={() => send("Heat", { action: "position", value: "floor" })} />
            <Btn label="Off" on={pos === "off"} onClick={() => send("Off", { action: "position", value: "off" })} />
            {(["auto", "on"] as const).map((m) => <Btn key={m} label={m === "auto" ? "Auto" : "On 24°"} on={s.floor_mode === m} color={C.amber} onClick={() => send(m, { action: "floor_mode", value: m })} />)}
          </Card>

          <Card title="Diesel heater" status={hs?.error ?? dieselStatus} color={hs?.error ? C.red : hs?.running ? C.orange : C.mute}>
            {d?.connected && (hs?.running ? <>
              <Btn label="Clean stop" color={C.orange} on onClick={() => send("Clean stop", { action: "diesel_stop", clean: true })} />
              <Btn label="Stop now" onClick={() => send("Stop now", { action: "diesel_stop", clean: false })} />
              <Btn label="−" onClick={() => send("Level −", { action: "diesel_level", value: Math.max(1, (hs.level ?? d.low) - 1) })} />
              <Btn label="+" onClick={() => send("Level +", { action: "diesel_level", value: Math.min(10, (hs.level ?? d.low) + 1) })} />
            </> : <>
              <select value={dur} onChange={(e) => setDur(+e.target.value)} style={{ height: 44, borderRadius: 12, background: "#171B21", color: C.ink, border: `1px solid ${C.line}`, padding: "0 8px", fontSize: 15 }}>
                <option value={20}>20 min</option><option value={60}>1 h</option><option value={120}>2 h</option><option value={0}>Until off</option>
              </select>
              {(["low", "mid", "high"] as const).map((k) => <Btn key={k} label={`${k[0].toUpperCase()}${k.slice(1)} · ${d[k] ?? ""}`} color={C.orange} onClick={() => send(`Diesel ${k}`, { action: "diesel", level: k, minutes: dur })} />)}
            </>)}
          </Card>

          <Card title="Air conditioner" color={ac?.power ? (ac.mode === "dry" ? C.teal : C.blue) : C.mute}
            status={!ac ? "not responding" : !ac.power ? "Off" : ac.mode === "dry" ? `Dehumidifying${s.dry_minutes_left ? ` · ${s.dry_minutes_left} min left` : ""}` : `${ac.mode} ${ac.target}° · ${ac.fan} fan`}>
            <Btn label="Cool" on={pos === "cool"} color={C.blue} onClick={() => send("Cool", { action: "position", value: "cool" })} />
            <Btn label="Cool+" on={pos === "coolmax"} color={C.blue} onClick={() => send("Cool+", { action: "position", value: "coolmax" })} />
            <select value={dryDur} onChange={(e) => setDryDur(+e.target.value)} style={{ height: 44, borderRadius: 12, background: "#171B21", color: C.ink, border: `1px solid ${C.line}`, padding: "0 8px", fontSize: 15 }}>
              <option value={60}>Dry 1 h</option><option value={180}>Dry 3 h</option><option value={480}>Dry 8 h</option>
            </select>
            {([["low", "Mini"], ["auto", "Auto"], ["high", "Max"]] as const).map(([fan, label]) => (
              <Btn key={fan} label={label} color={C.teal} on={s.dry_minutes_left > 0 && s.ac_fan === fan}
                onClick={() => send(`Dry ${label}`, { action: "ac_fan", value: fan }, ...(s.dry_minutes_left > 0 ? [] : [{ action: "dry", minutes: dryDur }]))} />
            ))}
            {s.dry_minutes_left > 0 && <Btn label="Stop dry" onClick={() => send("Stop dry", { action: "dry", minutes: 0 })} />}
          </Card>

          {s.victron && Object.keys(s.victron).length > 0 && (() => {
            const m = s.victron.mppt ?? {}, ch = s.victron.charger ?? {};
            return <>
              <Card title="Solar (MPPT)" color={m.error ? C.red : (m.pv_power ?? 0) > 0 ? C.amber : C.mute}
                status={m.error ?? `${m.pv_power ?? "–"} W · ${m.battery_voltage ?? "–"} V · ${m.battery_current ?? "–"} A · ${m.state_name ?? ""}`}>
                {!m.error && <div style={{ fontSize: 13, color: C.mute }}>Today {m.yield_today_kwh ?? "–"} kWh{m.load_current != null ? ` · load ${m.load_current} A` : ""}{m.error ? "" : ` · ${m.age_s} s ago`}</div>}
              </Card>
              <Card title="Charger (Blue Smart)" color={ch.error ? C.mute : C.teal}
                status={ch.error ?? `${ch.state_name ?? ""} · ${ch.battery_voltage ?? "–"} V · ${ch.battery_current ?? "–"} A`} />
            </>;
          })()}

          <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => setRaw(!raw)} style={{ background: "none", border: 0, color: C.ink, fontSize: 16, fontWeight: 600, textAlign: "left", padding: 0, cursor: "pointer" }}>
              {raw ? "▾" : "▸"} Raw controls <span style={{ fontSize: 13, color: C.mute, fontWeight: 400 }}>· direct device commands; the app&apos;s rules let go of that device</span>
            </button>
            {raw && <>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.amber }}>Floor thermostat {s.manual?.floor ? "· manual" : "· rules"} <span style={{ color: C.mute, fontWeight: 400 }}>{floor ? `${floor.power ? "on" : "off"} · set ${floor.setpoint}° · ${floor.mode}` : ""}</span></div>
              <Row label="Power">
                <Btn label="On" on={floor?.power} color={C.amber} onClick={() => send("Floor on", { action: "raw", device: "floor", power: true })} />
                <Btn label="Off" on={floor && !floor.power} onClick={() => send("Floor off", { action: "raw", device: "floor", power: false })} />
              </Row>
              <Row label="Setpoint">
                <Btn label="−0.5" onClick={() => send("Floor −", { action: "raw", device: "floor", setpoint: (floor?.setpoint ?? 20) - 0.5 })} />
                <span style={{ minWidth: 48, textAlign: "center" }}>{deg(floor?.setpoint)}</span>
                <Btn label="+0.5" onClick={() => send("Floor +", { action: "raw", device: "floor", setpoint: (floor?.setpoint ?? 20) + 0.5 })} />
              </Row>
              <Row label="Mode">
                {(["home", "auto"] as const).map((m) => <Btn key={m} label={m === "home" ? "Manual" : "Schedule"} on={floor?.mode === m} color={C.amber} onClick={() => send(`Floor ${m}`, { action: "raw", device: "floor", mode: m })} />)}
              </Row>

              <div style={{ fontSize: 14, fontWeight: 600, color: C.blue, marginTop: 6 }}>Air conditioner {s.manual?.ac ? "· manual" : "· rules"} <span style={{ color: C.mute, fontWeight: 400 }}>{ac ? `${ac.power ? "on" : "off"} · ${ac.mode} ${ac.target}° · fan ${ac.fan}` : ""}</span></div>
              <Row label="Power">
                <Btn label="On" on={ac?.power} color={C.blue} onClick={() => send("AC on", { action: "raw", device: "ac", power: true })} />
                <Btn label="Off" on={ac && !ac.power} onClick={() => send("AC off", { action: "raw", device: "ac", power: false })} />
              </Row>
              <Row label="Mode">
                {(["cool", "dry", "fan"] as const).map((m) => <Btn key={m} label={m[0].toUpperCase() + m.slice(1)} on={ac?.mode === m} color={C.blue} onClick={() => send(`AC ${m}`, { action: "raw", device: "ac", mode: m })} />)}
              </Row>
              <Row label="Target">
                <Btn label="−1" onClick={() => send("AC −", { action: "raw", device: "ac", target: (ac?.target ?? 24) - 1 })} />
                <span style={{ minWidth: 48, textAlign: "center" }}>{deg(ac?.target)}</span>
                <Btn label="+1" onClick={() => send("AC +", { action: "raw", device: "ac", target: (ac?.target ?? 24) + 1 })} />
              </Row>
              <Row label="Fan">
                {(["low", "high", "auto"] as const).map((f) => <Btn key={f} label={f[0].toUpperCase() + f.slice(1)} on={ac?.fan === f} color={C.blue} onClick={() => send(`AC fan ${f}`, { action: "raw", device: "ac", fan: f })} />)}
              </Row>

              <div style={{ fontSize: 14, fontWeight: 600, color: C.orange, marginTop: 6 }}>Diesel heater {s.manual?.diesel ? "· manual" : "· timer"} <span style={{ color: C.mute, fontWeight: 400 }}>{d?.connected ? `${hs?.running ? `${hs.step} · level ${hs.level}` : "off"}` : "not connected"}</span></div>
              <Row label="Power">
                <Btn label="On" on={hs?.running} color={C.orange} onClick={() => send("Diesel on", { action: "raw", device: "diesel", power: true })} />
                <Btn label="Off" on={d?.connected && !hs?.running} onClick={() => send("Diesel off", { action: "raw", device: "diesel", power: false })} />
              </Row>
              <Row label="Level">
                <Btn label="−" onClick={() => send("Diesel −", { action: "raw", device: "diesel", level: Math.max(1, (hs?.level ?? 3) - 1) })} />
                <span style={{ minWidth: 48, textAlign: "center" }}>{hs?.level ?? "–"}</span>
                <Btn label="+" onClick={() => send("Diesel +", { action: "raw", device: "diesel", level: Math.min(10, (hs?.level ?? 3) + 1) })} />
              </Row>
              <div style={{ fontSize: 12, color: C.mute }}>Raw diesel Off skips the clean stop (10 min at high to burn off soot). Use the preset Clean stop above when you can.</div>
            </>}
          </section>

          <History call={getJson} />

          {(s.alerts ?? []).map((a: Any) => (
            <Card key={a.id} title={a.text} status={a.sub} color="#CDB28C">
              {a.action && <Btn label={a.action} color={C.amber} onClick={() => send(a.action, a.id === "cleanout" ? { action: "diesel_cleanout" } : { action: "dismiss", id: a.id })} />}
            </Card>
          ))}
          <div style={{ fontSize: 12, color: C.mute, textAlign: "center" }}>Z1 app {s.app} · battery {s.battery?.percent ?? "–"}%</div>
        </>
      )}
    </main>
  );
}
