"use client";

import { useEffect } from "react";

/** Shared UI for route error boundaries. Shows a reference code, never error details. */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server errors are already logged on the server (with this digest); log client errors here.
    if (!error.digest) console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        Please try again. If it keeps happening, contact support
        {error.digest ? (
          <>
            {" "}with reference <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
