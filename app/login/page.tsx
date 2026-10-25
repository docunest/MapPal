"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/** Only same-site paths, so a crafted link can't bounce you elsewhere after login. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Missing server settings (e.g. no database) would make every login fail
  // with a confusing "wrong password" — say what's actually wrong instead.
  const [setupProblems, setSetupProblems] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { problems?: string[] }) => setSetupProblems(d.problems ?? []))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Wrong email or password.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6 bg-white shadow-sm">
        <h1 className="text-xl font-semibold">MapPal</h1>
        <p className="text-sm text-neutral-500">Family login</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        {setupProblems.length > 0 && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
            <p className="font-medium">The server isn&apos;t set up yet:</p>
            <ul className="list-disc pl-5">
              {setupProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-neutral-900 text-white py-2 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
