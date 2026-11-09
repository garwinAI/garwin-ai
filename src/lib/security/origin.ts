// CSRF defence for custom POST/PUT/PATCH/DELETE route handlers.
// Server Actions already get this check from Next.js (Origin must match Host); route handlers
// do not, so any state-changing route handler must call isSameOrigin() first.

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isSameOrigin(method: string, headers: Headers, appUrl: string): boolean {
  if (!UNSAFE.has(method.toUpperCase())) return true;
  const origin = headers.get("origin");
  // Browsers send Origin on cross-site and same-site POSTs; a missing Origin on an unsafe method is refused.
  if (!origin) return false;
  const allowed = new Set([new URL(appUrl).origin]);
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto") ?? new URL(appUrl).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(origin);
}
