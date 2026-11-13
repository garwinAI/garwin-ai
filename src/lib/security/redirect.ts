/**
 * Only allow redirects to paths on this site, never to other origins ("open redirect" attacks):
 * "/invite" is fine; "//evil.com", "https://evil.com", "/\\evil.com" and "javascript:" are not.
 */
export function safeNextPath(next: unknown, fallback = "/assistant"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 200) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const url = new URL(next, "https://garwinai.invalid");
    if (url.origin !== "https://garwinai.invalid") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
