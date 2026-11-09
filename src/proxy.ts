// Fast, optimistic route gate. Real authorization happens server-side
// (requireUser / requireAdmin), which also checks the session against the database.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** Pages for signed-out visitors; signed-in users are sent to the app. */
const AUTH_PAGES = ["/login", "/signup"];

/** Reachable without a session. Add webhook endpoints here (they authenticate by signature). */
const PUBLIC_PREFIXES = ["/api/health", "/api/auth/session-expired"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (matches(pathname, PUBLIC_PREFIXES)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (matches(pathname, AUTH_PAGES)) {
    return session ? NextResponse.redirect(new URL("/assistant", req.url)) : NextResponse.next();
  }
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (matches(pathname, ["/admin"]) && session.role !== "admin") {
    return NextResponse.redirect(new URL("/assistant", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static files and the public landing page ("/").
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$|$).*)"],
};
