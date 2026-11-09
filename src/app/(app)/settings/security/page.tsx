import type { Metadata } from "next";
import { logOutEverywhere } from "@/lib/auth/actions";
import { ComingSoon } from "@/components/page-header";
import { Section } from "../section";

export const metadata: Metadata = { title: "Security" };

export default function SecuritySettings() {
  return (
    <>
      <Section title="Sessions" description="Signed in somewhere you don't recognize? Sign out of every device, including this one.">
        <form action={logOutEverywhere}>
          <button type="submit" className="btn-danger">Log out of all devices</button>
        </form>
      </Section>
      <Section title="Two-factor authentication" description="Add a second step when you log in.">
        <div className="flex items-center gap-3">
          <button className="btn-secondary" disabled>Set up two-factor</button>
          <ComingSoon phase={6} />
        </div>
      </Section>
      <Section title="Support access" description="Garwin AI support can only access your account if you approve a time-limited request. Every action is logged.">
        <p className="text-sm text-neutral-500">No active or pending support access requests.</p>
      </Section>
    </>
  );
}
