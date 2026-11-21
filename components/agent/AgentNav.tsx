import Link from "next/link";

const LINKS: Array<[string, string]> = [
  ["/agent/runs", "Runs"],
  ["/agent/debug", "Index & location map"],
  ["/agent/budget", "Budget log"],
  ["/agent/tokens", "Connector tokens"],
  ["/review", "Swipe"],
];

export function AgentNav({ here }: { here: string }) {
  return (
    <nav className="mb-3 flex flex-wrap gap-1 text-sm">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={`rounded-full px-3 py-1 ${href === here ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
