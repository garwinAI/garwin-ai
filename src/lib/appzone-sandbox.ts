// Rules for APPZONE_SANDBOX_ORIGIN: the separate origin that serves AppZone app files.
// Kept free of server-only imports because next.config.ts uses it at build time.

/**
 * Returns the normalized sandbox origin (e.g. "https://garwinapps.com"), or null when the value is
 * unset or unsafe. Unsafe means: not a bare origin, not https (http is allowed only for localhost
 * outside production), or on the same site as the app itself (same host or a parent/child domain,
 * which could share cookies with the app).
 */
export function parseSandboxOrigin(raw: string | undefined, appUrl: string, isProduction: boolean): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  // Bare origin only: no credentials, path, query or fragment.
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/") return null;

  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost && !isProduction)) return null;

  let app: URL;
  try {
    app = new URL(appUrl);
  } catch {
    return null;
  }
  if (url.origin === app.origin) return null;
  if (!isLocalhost && sameSite(url.hostname, app.hostname)) return null;

  return url.origin;
}

function sameSite(a: string, b: string) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
