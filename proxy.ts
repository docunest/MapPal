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
  // Public: the login screen reports missing server settings before anyone
  // can log in (names only — see app/api/health/route.ts).
  const isHealth = req.nextUrl.pathname === "/api/health";
  // Own token auth (lib/dock/auth.ts): the phone's share shortcut and the
  // car head unit can't do the login screen.
  const isDockApi = req.nextUrl.pathname.startsWith("/api/dock");
  // Camper control (lib/camper/auth.ts): the Z1 and the owner's link use a
  // token; the /camper page asks for it when there's no session.
  const isCamper = req.nextUrl.pathname.startsWith("/api/camper") || req.nextUrl.pathname === "/camper";
  // Car places on the phone with the dock token (/car#t=<token>, kept in the
  // browser): the page is only a shell, its data needs the token (/api/dock).
  const isCarPage = req.nextUrl.pathname === "/car";

  if (isAuthApi || isAdminApi || isMagicLogin || isHealth || isDockApi || isCamper || isCarPage || isLoginPage) return NextResponse.next();

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    // Keep where they were going — the Android button's ?lat=&lng= link
    // must survive the login screen. API calls just get the redirect.
    if (!req.nextUrl.pathname.startsWith("/api/")) {
      loginUrl.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
