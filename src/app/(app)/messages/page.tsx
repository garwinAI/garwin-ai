import type { Metadata } from "next";
import { LifeBuoy, MessageSquare, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { isAppActive } from "@/server/services/apps";
import { PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { DeactivatedApp } from "@/components/deactivated-app";

export const metadata: Metadata = { title: "Messages" };

const CHANNELS = [
  { icon: Users, label: "Team", body: "Messages between you (the host) and your team members." },
  { icon: LifeBuoy, label: "Support", body: "Talk to Garwin AI support and track your tickets." },
];

export default async function MessagesPage() {
  const user = await requireUser();
  if (!(await isAppActive(user, "messages"))) {
    return <DeactivatedApp name="Messages" canManage={(await getEntitlements(user)).canManageApps} />;
  }
  return (
    <>
      <PageHeader title="Messages" description="Team conversations, support and notifications." actions={<PlannedBadge phase={3} />} />
      <div className="grid min-h-[calc(100dvh-9rem)] md:grid-cols-[260px_1fr] lg:min-h-[calc(100dvh-5.25rem)]">
        <section aria-label="Channels" className="border-b border-neutral-200 bg-white p-3 md:border-b-0 md:border-r">
          <ul className="space-y-1">
            {CHANNELS.map(({ icon: Icon, label, body }) => (
              <li key={label} className="rounded-lg p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 text-neutral-500" aria-hidden="true" /> {label}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{body}</p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Conversation" className="flex flex-col items-center justify-center p-8 text-center">
          <MessageSquare className="h-8 w-8 text-neutral-300" aria-hidden="true" />
          <p className="mt-3 font-medium">No conversations yet</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            Messaging arrives with team members and support tickets. Conversations will show up here.
          </p>
        </section>
      </div>
    </>
  );
}
