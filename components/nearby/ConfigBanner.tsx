"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Check {
  name: string;
  ok: boolean;
  effect: string;
}

interface Config {
  required: Check[];
  optional: Check[];
  database: { ok: boolean; error?: string };
}

// Only features people notice belong in the banner; the rest is on /sources.
const BANNER_OPTIONAL = new Set(["GOOGLE_MAPS_API_KEY", "DEEPSEEK_API_KEY"]);
const DISMISS_KEY = "mappal.configBannerDismissed";

/** Tells the family when server settings are missing, instead of features silently not working. */
export function ConfigBanner() {
  const [config, setConfig] = useState<Config | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
    try {
      // Per-device convenience read once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(localStorage.getItem(DISMISS_KEY));
    } catch {
      // storage blocked — banner just can't be dismissed permanently
    }
  }, []);

  if (!config) return null;
  const broken = [
    ...config.required.filter((c) => !c.ok).map((c) => `${c.name} is not set — ${c.effect}`),
    ...(config.database.ok ? [] : [`Database: ${config.database.error}`]),
  ];
  const off = config.optional.filter((c) => !c.ok && BANNER_OPTIONAL.has(c.name));
  // Dismissal is per set of missing keys: a newly missing key shows again.
  const offKey = off.map((c) => c.name).join(",");

  if (broken.length) {
    return (
      <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
        <p className="font-medium">Server setup problem</p>
        <ul className="list-disc pl-5">
          {broken.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (!off.length || dismissed === offKey) return null;
  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <div className="flex-1 space-y-0.5">
        {off.map((c) => (
          <p key={c.name}>
            {c.effect} <span className="text-amber-700">({c.name} not set on the server)</span>
          </p>
        ))}
        <Link href="/sources" className="underline">
          Server setup
        </Link>
      </div>
      <button
        onClick={() => {
          setDismissed(offKey);
          try {
            localStorage.setItem(DISMISS_KEY, offKey);
          } catch {
            // ignore
          }
        }}
        aria-label="Dismiss"
        className="px-1"
      >
        ✕
      </button>
    </div>
  );
}
