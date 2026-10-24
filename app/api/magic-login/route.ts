import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { signIn } from "@/auth";

// Public by design (exempted from the session gate in proxy.ts) — this IS
// the login mechanism for a token-holder. The token itself is the secret:
// single-use and expires per app/api/admin/login-links/route.ts.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  try {
    // signIn() redirects on success by throwing Next's internal redirect
    // signal, which we rethrow below so Next.js turns it into a real
    // redirect response instead of us swallowing it as a failure.
    await signIn("magic-link", { token, redirectTo: "/" });
  } catch (err) {
    unstable_rethrow(err);
    return NextResponse.redirect(new URL("/login?error=invalid_or_expired_link", req.url));
  }

  return NextResponse.redirect(new URL("/", req.url));
}
