import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { describeAgent } from "@/lib/user-agent";
import type { SecurityEvent } from "@/db/schema";
import { listSecurityEvents } from "@/server/services/security-events";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";

export const metadata: Metadata = { title: "IP History" };

const LABELS: Record<SecurityEvent, string> = {
  signup: "Account created",
  login: "Sign-in",
  logout: "Signed out",
  password_changed: "Password changed",
  password_reset_requested: "Password reset requested",
  password_reset: "Password reset",
  email_verification_sent: "Verification email sent",
  email_verified: "Email verified",
  session_revoked: "Device signed out",
  sessions_revoked: "Signed out other devices",
};

export default async function IpHistory() {
  const user = await requireUser();
  const events = await listSecurityEvents(user.id, 50);

  return (
    <CardSection id="ip-history" title="IP history and account activity" description="Sign-ins and security changes on your account, newest first (last 50).">
      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No activity recorded yet.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[620px] text-sm">
            <caption className="sr-only">Account activity, newest first</caption>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-6 py-2 font-medium">When</th>
                <th scope="col" className="px-6 py-2 font-medium">Activity</th>
                <th scope="col" className="px-6 py-2 font-medium">IP address</th>
                <th scope="col" className="px-6 py-2 font-medium">Device</th>
                <th scope="col" className="px-6 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100 last:border-0">
                  <td className="whitespace-nowrap px-6 py-2.5"><LocalTime iso={e.createdAt.toISOString()} /></td>
                  <td className="px-6 py-2.5">{LABELS[e.event] ?? e.event}</td>
                  <td className="px-6 py-2.5 font-mono text-xs">{e.ip ?? "Unknown"}</td>
                  <td className="px-6 py-2.5 text-neutral-600">{describeAgent(e.userAgent)}</td>
                  <td className="px-6 py-2.5">{e.success ? <Badge tone="success">Success</Badge> : <Badge tone="danger">Failed</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardSection>
  );
}
