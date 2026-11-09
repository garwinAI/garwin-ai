import type { Metadata } from "next";
import { logOutEverywhere } from "@/lib/auth/actions";
import { CardSection } from "@/components/ui/card";
import { PlannedBadge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Security" };

export default function SecuritySettings() {
  return (
    <>
      <CardSection id="sessions" title="Sessions" description="Signed in somewhere you don't recognize? Sign out of every device, including this one.">
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
