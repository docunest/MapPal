"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Job {
  id: string;
  status: string;
  candidateCount: number;
  error: string | null;
  finishedAt: string | null;
  sourcesTried: string[] | null;
  category: { label: string; slug: string };
  tile: { h3Index: string };
}

// Every collector today is a static lookup, not AI — label it that way
// wherever sourcesTried is shown.
const SOURCE_LABELS: Record<string, string> = {
  "osm-overpass": "OSM/Overpass (static)",
};

function CoverageContent() {
  const params = useSearchParams();
  const regionId = params.get("regionId");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!regionId) return;
    fetch(`/api/coverage?regionId=${regionId}`)
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }, [regionId]);

  if (!regionId) {
    return <p className="p-6">No region selected. Go back to the map and pick one.</p>;
  }

  const visible = filter === "ALL" ? jobs : jobs.filter((j) => j.status === filter);
  const statusColor: Record<string, string> = {
    DONE: "bg-emerald-100 text-emerald-800",
    PENDING: "bg-neutral-100 text-neutral-600",
    RUNNING: "bg-blue-100 text-blue-800",
    ERROR: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Coverage ledger</h1>
        <Link href="/" className="text-blue-600 underline text-sm">
          ← Back to map
        </Link>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        Every tile × category job this region has ever queued — nothing gets scanned, or skipped,
        without showing up here.
      </p>

      <div className="flex gap-2 mb-3 text-sm">
        {["ALL", "PENDING", "RUNNING", "DONE", "ERROR"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-2 py-1 rounded border ${filter === s ? "bg-neutral-900 text-white" : ""}`}
          >
            {s}
          </button>
        ))}
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Tile (H3)</th>
            <th>Category</th>
            <th>Status</th>
            <th>Candidates</th>
            <th>Sources</th>
            <th>Finished</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((j) => (
            <tr key={j.id} className="border-b last:border-0">
              <td className="py-1 font-mono text-xs">{j.tile.h3Index}</td>
              <td>{j.category.label}</td>
              <td>
                <span className={`px-2 py-0.5 rounded text-xs ${statusColor[j.status] ?? ""}`}>
                  {j.status}
                </span>
              </td>
              <td>{j.candidateCount}</td>
              <td className="text-xs text-neutral-500">
                {(j.sourcesTried ?? []).map((s) => SOURCE_LABELS[s] ?? s).join(", ") || "—"}
              </td>
              <td className="text-xs text-neutral-500">
                {j.finishedAt ? new Date(j.finishedAt).toLocaleString() : "—"}
              </td>
              <td className="text-xs text-red-600">{j.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoveragePage() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <CoverageContent />
    </Suspense>
  );
}
