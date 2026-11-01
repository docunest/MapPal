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

  const send = async (label: string, body: Any) => {
    setBusy(label);
    try { await call("/api/camper/commands", { method: "POST", body: JSON.stringify(body) }); await load(); } catch (e) { setError((e as Error).message); }
    setTimeout(() => setBusy(null), 6000);
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
            <Btn label="Dry 1 h" color={C.teal} on={s.dry_minutes_left > 0} onClick={() => send("Dry 1 h", { action: "dry", minutes: 60 })} />
            <Btn label="Dry 3 h" color={C.teal} onClick={() => send("Dry 3 h", { action: "dry", minutes: 180 })} />
            {s.dry_minutes_left > 0 && <Btn label="Stop dry" onClick={() => send("Stop dry", { action: "dry", minutes: 0 })} />}
          </Card>

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
