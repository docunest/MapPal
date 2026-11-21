import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgentNav } from "@/components/agent/AgentNav";
import { RateButtons } from "@/components/agent/RateButtons";
import { RunDebug } from "@/components/agent/RunDebug";
import { costLog, getRun, PASS_THUMBS, PASS_WEEKLY_PCT, reviewsOf, titlesOfUseCases } from "@/lib/agent";

// One cost-test run: what it spent, what it kept (with 👍/👎 for the pass
// test), what the rules dropped. Verdicts are AI; facts link to their source.
type Review = Awaited<ReturnType<typeof reviewsOf>>[number];
interface ReviewData {
  vibe?: string;
  vibe_confidence?: number;
  availability?: { kitchen_hours?: string; peak_times?: string; risks?: Array<{ flag: string; note: string }> };
  food_tags?: string[];
  price_samples?: Array<{ item: string; price: number; size?: string; currency?: string }>;
  access?: string;
  how_to_get_there?: string;
  parking?: string;
  safety_notes?: string;
  photo?: { source: string; page?: string; credit?: string };
}

function Place({ r }: { r: Review }) {
  const d = r.data as ReviewData;
  const ev = r.evidence as Array<{ kind: string; url?: string; note: string }>;
  return (
    <li className={`rounded border p-3 ${r.keep ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-75"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            {r.name} <span className="text-xs text-neutral-500">{r.candidate}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            <span className={`rounded px-1.5 py-0.5 ${r.verdict === "real" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {r.verdict} {Math.round(r.confidence * 100)} %
            </span>
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800">AI</span>
            {d.vibe && <span className="rounded bg-neutral-100 px-1.5 py-0.5">{d.vibe}</span>}
            {d.access && <span className="rounded bg-neutral-100 px-1.5 py-0.5">access: {d.access}</span>}
            {!r.keep && <span className="rounded bg-neutral-100 px-1.5 py-0.5">not kept</span>}
          </div>
        </div>
        {r.keep && <RateButtons id={r.id} initial={(r.ownerRating as "up" | "down" | null) ?? null} />}
      </div>
      <p className="mt-2 text-sm">{r.summary}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
        {d.availability?.kitchen_hours && <li>Kitchen: {d.availability.kitchen_hours}</li>}
        {d.availability?.peak_times && <li>Busy: {d.availability.peak_times}</li>}
        {d.availability?.risks?.map((x, i) => <li key={i}>⚠️ {x.flag}: {x.note}</li>)}
        {d.food_tags?.length ? <li>Food: {d.food_tags.join(", ")}</li> : null}
        {d.price_samples?.length ? <li>Prices: {d.price_samples.map((p) => `${p.item}${p.size ? ` (${p.size})` : ""} ${p.price} ${p.currency ?? "EUR"}`).join(" · ")}</li> : null}
        {d.how_to_get_there && <li>Getting there: {d.how_to_get_there}</li>}
        {d.parking && <li>Parking: {d.parking}</li>}
        {d.safety_notes && <li>Safety: {d.safety_notes}</li>}
      </ul>
      {d.photo?.page && d.photo.source !== "google" && (
        <a href={d.photo.page} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">
          Photo the agent saw ({d.photo.source})
        </a>
      )}
      <div className="mt-1 flex flex-wrap gap-1 text-xs">
        <a href={`https://www.openstreetmap.org/${r.osmRef}`} target="_blank" rel="noreferrer" className="rounded bg-neutral-100 px-1.5 py-0.5 underline">
          OSM
        </a>
        <a
          href={r.googlePlaceId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}&query_place_id=${r.googlePlaceId}` : `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800"
        >
          Google Maps
        </a>
        <a href={`https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`} target="_blank" rel="noreferrer" className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">
          Waze
        </a>
      </div>
      {ev.length > 0 && (
        <details className="mt-1 text-xs text-neutral-600">
          <summary>Evidence ({ev.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {ev.map((e, i) => (
              <li key={i}>
                [{e.kind}] {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="underline">{e.note}</a> : e.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export default function AgentRunPage({ params }: PageProps<"/agent/runs/[id]">) {
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
      <Run params={params} />
    </Suspense>
  );
}

async function Run({ params }: { params: PageProps<"/agent/runs/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  const [reviews, titles] = await Promise.all([reviewsOf(run.id), titlesOfUseCases()]);
  const log = costLog(run, reviews);
  const z = run.plan.zone;
  const box = "rounded border border-neutral-200 p-3 text-sm";
  return (
    <main className="mx-auto max-w-5xl p-4">
      <AgentNav here="/agent/runs" />
      <h1 className="mt-2 text-xl font-semibold">
        {z.campsite.name} <span className="text-base font-normal text-neutral-500">· {run.status}</span>
      </h1>
      <p className="text-sm text-neutral-600">
        {run.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · agent {run.agent}
        {run.model ? ` · ${run.model}` : ""}
      </p>

      <section className={`mt-3 ${box}`}>
        <h2 className="font-semibold">Cost</h2>
        <ul className="mt-1 space-y-0.5">
          <li>
            Weekly allowance:{" "}
            {log.weeklyPct === null ? "not measured yet" : `${log.weeklyPct} % (${run.usageBeforePct} → ${run.usageAfterPct}) ${log.costPass ? "✅ under" : "❌ over"} ${PASS_WEEKLY_PCT} %`}
          </li>
          <li>
            Served to the agent: {log.tokens.toLocaleString()} tokens (text {log.textTokens.toLocaleString()}, images {log.imageTokens.toLocaleString()}) of {run.caps.tokens.toLocaleString()}
          </li>
          <li>
            Pages {log.pages}/{run.caps.pages} · images {log.images}/{run.caps.images} · Google {log.googleDetails} details, {log.googlePhotos} photos (free tier)
          </li>
          {Object.keys(log.found).map((cat) => (
            <li key={cat}>
              {titles[cat] ?? cat}: {log.found[cat]} on the map → {log.checked[cat] ?? 0} checked → {log.kept[cat] ?? 0} kept
            </li>
          ))}
          <li>
            Per kept place: {log.tokensPerKept?.toLocaleString() ?? "–"} tokens{log.weeklyPctPerKept !== null ? `, ${log.weeklyPctPerKept} % of the week` : ""}
          </li>
          <li>
            Real and relevant (your 👍): {log.rated ? `${log.thumbsUp}/${log.rated}` : "not rated yet"}
            {log.relevancePass !== null ? ` ${log.relevancePass ? "✅" : "❌"} (need ${PASS_THUMBS * 100} %)` : ""}
          </li>
          {log.claude && (
            <li>
              Claude&apos;s own use: {log.claude.total.toLocaleString()} tokens (in {log.claude.input.toLocaleString()}, out {log.claude.output.toLocaleString()}, cache read {log.claude.cacheRead.toLocaleString()}, cache write {log.claude.cacheWrite.toLocaleString()})
              {log.claudeTokensPerWeeklyPct ? ` → ${log.claudeTokensPerWeeklyPct.toLocaleString()} per 1 % of the week` : ""}
            </li>
          )}
          {run.cappedBy && <li>Stopped: {run.cappedBy}</li>}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">Estimate before the run: {run.plan.estimate.text}</p>
      </section>

      <section className="mt-3">
        <h2 className="mb-1 font-semibold">Under the hood</h2>
        <RunDebug runId={run.id} />
      </section>

      <section className={`mt-3 ${box}`}>
        <h2 className="font-semibold">Zone</h2>
        <p className="mt-1">{z.why}</p>
        <p className="mt-1 text-xs text-neutral-500">Target: {z.target.label} — {z.target.source}</p>
        {run.plan.notes.map((n, i) => (
          <p key={i} className="mt-1 text-xs text-amber-800">
            {n}
          </p>
        ))}
      </section>

      {Object.keys(run.plan.categories).map((cat) => {
        const list = reviews.filter((r) => r.category === cat);
        const pc = run.plan.categories[cat];
        return (
          <section key={cat} className="mt-4">
            <h2 className="font-semibold">{titles[cat] ?? cat}</h2>
            {!list.length && <p className="text-sm text-neutral-600">No reviews yet.</p>}
            <ul className="mt-2 space-y-2">
              {list.map((r) => (
                <Place key={r.id} r={r} />
              ))}
            </ul>
            <details className="mt-2 text-xs text-neutral-600">
              <summary>
                Dropped by rules ({pc.dropped.length}), cached ({pc.cached.length}), over the cap ({pc.overCap})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {pc.cached.map((n) => (
                  <li key={`c-${n}`}>{n} — reviewed in the last 30 days</li>
                ))}
                {pc.dropped.map((d) => (
                  <li key={d.osmRef}>
                    <a href={`https://www.openstreetmap.org/${d.osmRef}`} target="_blank" rel="noreferrer" className="underline">
                      {d.name}
                    </a>{" "}
                    — {d.reason}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        );
      })}
      {run.report && (
        <section className={`mt-4 ${box}`}>
          <h2 className="font-semibold">Agent&apos;s yield report (AI)</h2>
          <p className="mt-1 whitespace-pre-wrap">{run.report}</p>
        </section>
      )}
    </main>
  );
}
