import { AgentNav } from "@/components/agent/AgentNav";
import { Tokens } from "@/components/agent/Tokens";

export default function AgentTokensPage() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <AgentNav here="/agent/tokens" />
      <h1 className="mb-2 text-xl font-semibold">Connector tokens</h1>
      <p className="mb-3 text-sm text-neutral-600">One token per agent. Only a hash is stored; revoke one without touching the others.</p>
      <Tokens />
    </main>
  );
}
