import type { Metadata } from "next";
import { CheckCircle2, MailWarning, Monitor } from "lucide-react";
import { logOutEverywhere } from "@/lib/auth/actions";
import { requireSession } from "@/lib/auth/session";
import { describeAgent } from "@/lib/user-agent";
import { listActiveSessions } from "@/server/services/sessions";
import { CardSection } from "@/components/ui/card";
import { Badge, PlannedBadge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/form";
import { LocalTime } from "@/components/ui/local-time";
import { SignOutOthersButton, SignOutSessionButton } from "./session-buttons";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettings() {
  const { user, session: current } = await requireSession();
  const active = await listActiveSessions(user.id);

  return (
    <>
      <CardSection id="email-status" title="Email address">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {user.emailVerifiedAt ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
              <span className="font-medium">{user.email}</span>
              <Badge tone="success">Verified</Badge>
            </>
          ) : (
            <>
              <MailWarning className="h-4 w-4 text-accent-700" aria-hidden="true" />
              <span className="font-medium">{user.email}</span>
              <Badge tone="warning">Not verified</Badge>
              <span className="text-neutral-500">Use the banner at the top of the page to resend the link.</span>
            </>
          )}
        </p>
      </CardSection>

      <CardSection
        id="sessions"
        title="Where you're signed in"
        description="Sessions end after 7 days without use, or 30 days at most. Sign out any device you don't recognize."
        actions={<SignOutOthersButton disabled={active.length <= 1} />}
      >
        <ul className="divide-y divide-neutral-100" aria-label="Signed-in devices">
          {active.map((s) => {
            const isCurrent = s.id === current.id;
            return (
              <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {describeAgent(s.userAgent)}
                      {isCurrent && <Badge tone="brand">This device</Badge>}
                    </p>
                    <p className="text-neutral-500">
                      IP <span className="font-mono text-xs">{s.ip ?? "unknown"}</span> · Signed in <LocalTime iso={s.createdAt.toISOString()} /> · Last active{" "}
                      <LocalTime iso={s.lastSeenAt.toISOString()} />
                    </p>
                  </div>
                </div>
                <SignOutSessionButton sessionId={s.id} label={isCurrent ? "Sign out this device" : `Sign out ${describeAgent(s.userAgent)}`} />
              </li>
            );
          })}
        </ul>
      </CardSection>

      <CardSection id="sign-out-everywhere" title="Sign out everywhere" description="Ends every session, including this one.">
        <form action={logOutEverywhere}>
          <SubmitButton className="btn-danger" pendingText="Signing out…">Log out of all devices</SubmitButton>
        </form>
      </CardSection>

      <CardSection id="two-factor" title="Two-factor authentication" description="Add a second step when you log in." actions={<PlannedBadge phase={6} />}>
        <p className="text-sm text-neutral-500">Not available yet.</p>
      </CardSection>

      <CardSection
        id="support-access"
        title="Support access"
        description="Support can only access your account if you approve a time-limited request with a stated reason. Every action will be logged."
        actions={<PlannedBadge phase={6} />}
      >
        <p className="text-sm text-neutral-500">Access requests will appear here for you to approve or deny.</p>
      </CardSection>
    </>
  );
}
