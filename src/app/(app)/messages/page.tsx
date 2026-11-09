import type { Metadata } from "next";
import { LifeBuoy, MessageSquare, Users } from "lucide-react";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Messages" };

const CHANNELS = [
  { icon: Users, label: "Team", body: "Messages between you (the host) and your team members." },
  { icon: LifeBuoy, label: "Support", body: "Talk to Garwin AI support and track your tickets." },
];

export default function MessagesPage() {
  return (
    <>
      <PageHeader title="Messages" description="Team conversations, support and notifications." actions={<ComingSoon phase={3} />} />
      <div className="grid h-[calc(100vh-81px)] grid-cols-[280px_1fr]">
        <aside className="border-r border-neutral-200 bg-white p-3">
          {CHANNELS.map(({ icon: Icon, label, body }) => (
            <div key={label} className="mb-1 rounded-lg p-3 hover:bg-neutral-50">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4 text-neutral-500" /> {label}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">{body}</p>
            </div>
          ))}
        </aside>
        <section className="flex flex-col items-center justify-center p-8 text-center">
          <MessageSquare className="h-8 w-8 text-neutral-300" />
          <p className="mt-3 font-medium">No conversations yet</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            When you add team members or open a support ticket, conversations will show up here.
          </p>
        </section>
      </div>
    </>
  );
}
