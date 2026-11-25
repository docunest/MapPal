"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Item = { item: string; rounds: number; firstTryCorrect: number; accuracy: number; avgMs: number };
type Summary = {
  attempts: number;
  rounds: number;
  firstTryAccuracy: number | null;
  avgMs: number | null;
  items: Item[];
  weak: Item[];
  byAudio?: Item[];
  days: number;
  level: number | null;
};

// Level ids from the Ponas game (games/skaitymas/game.js): A = owner's levels, B = Montessori.
const LEVELS: [number | null, string][] = [
  [null, "Visi"], [1, "A1 skiemenys"], [2, "A2 raidės"], [3, "A3 rašymas"],
  [11, "B1 garsai"], [12, "B2 abėcėlė"], [13, "B3 rožinė"], [14, "B4 mėlyna"], [15, "B5 žalia"],
];

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)} %`);
const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);

export function ReadingSummary() {
  const [days, setDays] = useState(14);
  const [level, setLevel] = useState<number | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ days: String(days) });
    if (level) q.set("level", String(level));
    // Same site, so the MapPal login cookie goes along; no extra token.
    fetch(`/api/reading/summary?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setData(j);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [days, level]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#1F2A30", background: "#FFFFFF", minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 26, margin: "8px 0" }}>Skaitymo suvestinė</h1>
      <a href="/reading/words" style={{ display: "inline-block", margin: "4px 0 8px", fontSize: 17, color: "#00796B" }}>Tvarkyti žodžius ir raides →</a>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {[7, 14, 30].map((d) => (
          <button key={d} onClick={() => setDays(d)} style={chip(days === d)}>{d} d.</button>
        ))}
        {LEVELS.map(([l, label]) => (
          <button key={String(l)} onClick={() => setLevel(l)} style={chip(level === l)}>
            {label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "#B71C1C", fontSize: 18 }}>Nepavyko: {error}</p>}
      {!data && !error && <p style={{ fontSize: 18 }}>Kraunama…</p>}

      {data && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "12px 0" }}>
            <Stat label="Atsakymų" value={String(data.attempts)} />
            <Stat label="Teisingai iš karto" value={pct(data.firstTryAccuracy)} />
            <Stat label="Vidutinis atsakymo laikas" value={secs(data.avgMs)} />
          </section>

          <h2 style={{ fontSize: 20, marginTop: 20 }}>Silpniausi</h2>
          {data.weak.length === 0 ? (
            <p style={{ fontSize: 17 }}>Kol kas nėra aiškių silpnų vietų (reikia bent 3 bandymų vienai užduočiai).</p>
          ) : (
            <ul style={{ fontSize: 18, paddingLeft: 20 }}>
              {data.weak.map((w) => (
                <li key={w.item}><b>{w.item}</b>: {pct(w.accuracy)} iš {w.rounds}</li>
              ))}
            </ul>
          )}

          <h2 style={{ fontSize: 20, marginTop: 20 }}>Visos užduotys</h2>
          {data.items.length === 0 ? (
            <p style={{ fontSize: 17 }}>Dar nėra duomenų per pasirinktą laikotarpį.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 17 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #CFD8DC" }}>
                  <th style={{ padding: 6 }}>Užduotis</th><th>Kartų</th><th>Iš karto teisingai</th><th>Laikas</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.item} style={{ borderBottom: "1px solid #ECEFF1" }}>
                    <td style={{ padding: 6, fontSize: 20, fontWeight: 700 }}>{i.item}</td>
                    <td>{i.rounds}</td>
                    <td>{pct(i.accuracy)}</td>
                    <td>{secs(i.avgMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.byAudio && data.byAudio.length > 0 && (
            <>
              <h2 style={{ fontSize: 20, marginTop: 20 }}>Pagal balsą</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
                <tbody>
                  {data.byAudio.map((i) => (
                    <tr key={i.item} style={{ borderBottom: "1px solid #ECEFF1" }}>
                      <td style={{ padding: 6 }}>{i.item}</td><td>{i.rounds}</td><td>{pct(i.accuracy)}</td><td>{secs(i.avgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p style={{ fontSize: 14, color: "#607D8B", marginTop: 16 }}>
            Skaičiuojami tik pirmi bandymai: ar vaikas iš karto atsakė teisingai (žodžiuose: visos raidės iš karto).
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#F5F7F8", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 14, color: "#607D8B" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function chip(active: boolean): CSSProperties {
  return {
    padding: "10px 14px", fontSize: 16, borderRadius: 999, border: "1px solid #B0BEC5",
    background: active ? "#26A69A" : "#FFFFFF", color: active ? "#FFFFFF" : "#1F2A30", minHeight: 44,
  };
}
