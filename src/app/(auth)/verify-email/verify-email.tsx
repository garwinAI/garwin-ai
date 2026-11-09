"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { verifyEmailAction } from "@/lib/auth/actions";
import { useFragmentToken } from "@/components/auth/token-from-hash";

type Status = "checking" | "verified" | "invalid";

// One request per token, even if React runs the effect twice (Strict Mode in development).
// A second request would find the token already used and wrongly report it as invalid.
const attempts = new Map<string, Promise<{ ok: boolean }>>();
function verifyOnce(token: string) {
  if (!attempts.has(token)) attempts.set(token, verifyEmailAction(token));
  return attempts.get(token)!;
}

export function VerifyEmail() {
  const [status, setStatus] = useState<Status>("checking");
  const token = useFragmentToken();

  useEffect(() => {
    if (token === undefined) return;
    let cancelled = false;
    (async () => {
      const result = token ? await verifyOnce(token) : { ok: false };
      if (!cancelled) setStatus(result.ok ? "verified" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "checking") {
    return <p role="status" className="mt-4 text-sm text-neutral-500">Verifying…</p>;
  }
  if (status === "verified") {
    return (
      <div className="mt-4 space-y-4">
        <p role="status" className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Your email is verified. Thanks!
        </p>
        <Link href="/assistant" className="btn-primary w-full">Continue to Garwin AI</Link>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-4">
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        This verification link is invalid, expired or already used. Log in and send a new one from the banner at the top of the app.
      </p>
      <Link href="/assistant" className="btn-primary w-full">Go to Garwin AI</Link>
    </div>
  );
}
