// Fast, optimistic route gate based only on whether a session cookie is present.
// It can't tell if the session is still valid (that needs the database), so it is NOT a
// security boundary: every page/action calls requireSession()/requireUser()/requireAdmin().
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/cookie";

/** Pages for signed-out visitors; visitors with a session cookie are sent to the app. */
const AUTH_PAGES = ["/login", "/signup"];

/** Reachable with or without a session. Add webhook endpoints here (they authenticate by signature). */
const PUBLIC_PREFIXES = ["/api/health", "/api/stripe/webhook", "/api/auth/session-expired", "/forgot-password", "/reset-password", "/verify-email", "/invite"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (matches(pathname, PUBLIC_PREFIXES)) return NextResponse.next();

  const hasSession = req.cookies.has(sessionCookieName());

  if (matches(pathname, AUTH_PAGES)) {
    return hasSession ? NextResponse.redirect(new URL("/assistant", req.url)) : NextResponse.next();
  }
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static files and the public landing page ("/").
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$|$).*)"],
};
