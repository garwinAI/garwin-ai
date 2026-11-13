// Session cookie name and attributes. Edge-safe: no Node imports.
//
// In production the __Host- prefix makes the browser refuse the cookie unless it is Secure,
// has Path=/ and no Domain, so subdomains (e.g. a future AppZone sandbox) can never set or
// read it. Because of that prefix, DELETING the cookie must also send Secure; a plain
// `cookies.delete(name)` is silently ignored by browsers. Always use clearedSessionCookie().

const isProd = () => process.env.NODE_ENV === "production";

export function sessionCookieName(): string {
  return isProd() ? "__Host-garwin_session" : "garwin_session";
}

export function sessionCookieAttributes(maxAgeSec: number) {
  return {
    httpOnly: true, // never readable by JavaScript
    secure: isProd(),
    sameSite: "lax" as const, // not sent on cross-site POSTs
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** Arguments for cookies.set(...) that remove the session cookie in every environment. */
export function clearedSessionCookie() {
  return { name: sessionCookieName(), value: "", ...sessionCookieAttributes(0) };
}
