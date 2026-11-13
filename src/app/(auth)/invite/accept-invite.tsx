"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Users } from "lucide-react";
import { useFragmentToken } from "@/components/auth/token-from-hash";
import { acceptInviteAction, previewInviteAction, type InvitePreview } from "@/lib/team/actions";
import { logOut } from "@/lib/auth/actions";

// Kept for this browser tab only, so the invitation survives the trip through sign-up / log-in.
const STORAGE_KEY = "garwin_invite_token";

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function AcceptInvite() {
  const fromLink = useFragmentToken();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<InvitePreview | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (fromLink === undefined) return;
    const t = fromLink ?? storedToken();
    if (fromLink) {
      try {
        sessionStorage.setItem(STORAGE_KEY, fromLink);
      } catch {
        /* storage unavailable: the user can reopen the link after signing in */
      }
    }
    let cancelled = false;
    (async () => {
      const p = t ? await previewInviteAction(t) : ({ valid: false } as const);
      if (!cancelled) {
        setToken(t);
        setPreview(p);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromLink]);

  if (preview === undefined) return <p role="status" className="text-sm text-neutral-500">Checking your invitation…</p>;

  if (!preview.valid || !token) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Invitation not found</h1>
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          This invitation is invalid, expired or already used. Ask the host to send a new one.
        </p>
        <Link href="/assistant" className="btn-secondary w-full">Go to Garwin AI</Link>
      </div>
    );
  }

  const wrongAccount = preview.channel === "email" && preview.signedInAs && preview.invitedEmail !== preview.signedInAs;

  return (
    <div className="space-y-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50">
        <Users className="h-6 w-6 text-accent-700" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Join {preview.workspace}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {preview.hostName} invited you to their Garwin AI team. You&apos;ll share their workspace and keep your own.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!preview.signedInAs && preview.accountExists ? (
        <div className="space-y-2">
          <p role="status" className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700">
            You already have a Garwin AI account with <strong className="font-medium">{preview.invitedEmail}</strong>. Log in to join the team.
          </p>
          <Link href="/login?next=/invite" className="btn-primary w-full">
            Log in to join
          </Link>
        </div>
      ) : !preview.signedInAs ? (
        <div className="space-y-2">
          {preview.invitedEmail && (
            <p className="text-sm text-neutral-600">
              This invitation is for <strong className="font-medium">{preview.invitedEmail}</strong>.
            </p>
          )}
          <Link
            href={`/signup?next=/invite${preview.invitedEmail ? `&email=${encodeURIComponent(preview.invitedEmail)}` : ""}`}
            className="btn-primary w-full"
          >
            Create an account to join
          </Link>
          <Link href="/login?next=/invite" className="btn-secondary w-full">
            I already have an account
          </Link>
        </div>
      ) : wrongAccount ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
            You&apos;re signed in as <strong>{preview.signedInAs}</strong>, but this invitation is for <strong>{preview.invitedEmail}</strong>.
          </p>
          <form action={logOut}>
            <input type="hidden" name="next" value="/invite" />
            <button type="submit" className="btn-secondary w-full">Log out and use the invited email</button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">
            Signed in as <strong className="font-medium">{preview.signedInAs}</strong>.
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await acceptInviteAction(token);
                // Success redirects; we only get here on failure.
                if (result?.error) setError(result.error);
                else {
                  try {
                    sessionStorage.removeItem(STORAGE_KEY);
                  } catch {}
                }
              })
            }
          >
            {pending ? "Joining…" : `Join ${preview.workspace}`}
          </button>
        </div>
      )}
    </div>
  );
}
