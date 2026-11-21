import { Suspense } from "react";
import { AgentNav } from "@/components/agent/AgentNav";
import { IndexDebug } from "@/components/agent/IndexDebug";

// The place index and the location hints on one map; index more areas from here.
export default function AgentDebugPage() {
  return (
    <main className="mx-auto max-w-5xl p-4">
      <AgentNav here="/agent/debug" />
      <h1 className="mb-2 text-xl font-semibold">Index &amp; location map</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <IndexDebug />
      </Suspense>
    </main>
  );
}
