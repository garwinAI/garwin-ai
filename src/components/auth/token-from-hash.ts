"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Reads `token` from a URL fragment like "#token=abc". Returns null when missing or malformed. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

// Read the fragment once per page load.
let captured: string | null | undefined;
function readOnce(): string | null {
  if (captured === undefined) captured = tokenFromHash(window.location.hash);
  return captured;
}
const noSubscribe = () => () => {};

/**
 * The token from the URL fragment. `undefined` during server render / before hydration,
 * `null` if the link has no valid token.
 */
export function useFragmentToken(): string | null | undefined {
  const token = useSyncExternalStore(noSubscribe, readOnce, () => undefined);
  useEffect(() => {
    // Then strip the secret from the address bar and history (screenshots, shoulder-surfing,
    // back button). Next.js integrates with native history.replaceState, so its router stays in sync.
    if (token !== undefined && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [token]);
  return token;
}
