// Clears a session cookie that no longer refers to a valid session (revoked, expired, idle,
// or the user was deleted), then sends the visitor to log in. Without this, proxy.ts would see
// the cookie and bounce /login -> /assistant -> /login forever.
// It only clears INVALID cookies, so a cross-site link to this URL can't log anyone out.
import { NextResponse, type NextRequest } from "next/server";
import { clearedSessionCookie, sessionCookieName } from "@/lib/auth/cookie";
import { isKnownButInvalid } from "@/server/services/sessions";

export async function GET(req: NextRequest) {
  const name = sessionCookieName();
  const token = req.cookies.get(name)?.value;
  if (token && !(await isKnownButInvalid(token))) {
    return NextResponse.redirect(new URL("/assistant", req.url));
  }
  const res = NextResponse.redirect(new URL("/login?expired=1", req.url));
  res.cookies.set(clearedSessionCookie());
  return res;
}
