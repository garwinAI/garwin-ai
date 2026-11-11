// Fast, optimistic route gate. Real authorization happens server-side
// (requireUser / requireAdmin), which also checks the session against the database.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

const AUTH_PAGES = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isAuthPage) {
    return session ? NextResponse.redirect(new URL("/assistant", req.url)) : NextResponse.next();
  }
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/assistant", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static files, the health check, the Stripe webhook and the public landing page.
  matcher: ["/((?!_next/static|_next/image|api/health|api/stripe/webhook|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$|$).*)"],
};
