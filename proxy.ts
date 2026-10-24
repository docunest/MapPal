import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isAuthApi = req.nextUrl.pathname.startsWith("/api/auth");
  // Has its own secret-header auth (see app/api/admin/users/route.ts) — must
  // be reachable before any session exists, to bootstrap the first login.
  const isAdminApi = req.nextUrl.pathname.startsWith("/api/admin");
  // Public: this IS the sign-in mechanism for a magic-link token holder.
  const isMagicLogin = req.nextUrl.pathname.startsWith("/api/magic-login");

  if (isAuthApi || isAdminApi || isMagicLogin || isLoginPage) return NextResponse.next();

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
