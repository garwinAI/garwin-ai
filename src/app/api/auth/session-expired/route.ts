// Clears a cookie whose session was revoked (password change, "log out everywhere",
// deleted user), then sends the visitor to log in. Without this, proxy.ts would see a
// validly-signed cookie and bounce /login -> /assistant -> /login forever.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
