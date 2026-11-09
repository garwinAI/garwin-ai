import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { getEntitlements } from "@/server/services/entitlements";
import { isAppActive } from "@/server/services/apps";
import { getThread, listConversations } from "@/server/services/messaging";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DeactivatedApp } from "@/components/deactivated-app";
import { NoAccess } from "@/components/no-access";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";
import { AutoRefresh, Composer } from "./message-forms";

export const metadata: Metadata = { title: "Messages" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MessagesPage({ searchParams }: Props) {
  const user = await requireUser();
  const ent = await getEntitlements(user);
  if (!(await isAppActive(user, "messages"))) return <DeactivatedApp name="Messages" canManage={ent.canManageApps} />;
  if (!ent.can("messages.use")) return <NoAccess title="Messages" what="use messages" />;

  const conversations = await listConversations(user);
  const requested = (await searchParams).c;
  const selectedId =
    typeof requested === "string" && uuidSchema.safeParse(requested).success && conversations.some((c) => c.id === requested)
      ? requested
      : conversations[0].id;
  const selected = conversations.find((c) => c.id === selectedId)!;
  const thread = await getThread(user, selectedId);
  const onlyYou = conversations.length === 1 && ent.plan.teamMemberLimit === 0;

  return (
    <>
      <PageHeader title="Messages" description="Talk with your host and team." />
      <AutoRefresh seconds={10} />
      <div className="grid min-h-[calc(100dvh-9rem)] md:grid-cols-[260px_1fr] lg:min-h-[calc(100dvh-5.25rem)]">
        <nav aria-label="Conversations" className="border-b border-neutral-200 bg-white p-2 md:border-b-0 md:border-r">
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/messages?c=${c.id}`}
                  aria-current={c.id === selectedId ? "page" : undefined}
                  className={cn("flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm", c.id === selectedId ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {c.isTeam ? <Users className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" /> : <MessageSquare className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />}
                    <span className="truncate">{c.title}</span>
                  </span>
                  {c.unread > 0 && (
                    <Badge tone="accent">
                      {c.unread}
                      <span className="sr-only"> unread</span>
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-3 py-3 text-xs text-neutral-500">
            Start a one-to-one chat from <Link href="/settings/team" className="text-brand-700 hover:underline">Settings → Team</Link>.
          </p>
        </nav>

        <section aria-labelledby="thread-title" className="flex min-h-0 flex-col">
          <h2 id="thread-title" className="border-b border-neutral-200 bg-white px-5 py-3 font-semibold">
            {selected.title}
          </h2>
          <ol className="flex-1 space-y-3 overflow-y-auto px-5 py-4 pb-24" aria-label={`Messages in ${selected.title}`}>
            {thread.messages.length === 0 && (
              <li className="py-10 text-center text-sm text-neutral-500">
                {onlyYou ? "Invite team members to start a conversation." : "No messages yet. Say hello!"}
              </li>
            )}
            {thread.messages.map((m) => {
              const mine = m.senderId === user.id;
              return (
                <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <p className="mb-0.5 text-xs text-neutral-500">
                    {mine ? "You" : (m.senderName ?? "Former member")} · <LocalTime iso={m.createdAt.toISOString()} />
                  </p>
                  <p className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm", mine ? "bg-brand-600 text-white" : "border border-neutral-200 bg-white")}>
                    {m.body}
                  </p>
                </li>
              );
            })}
          </ol>
          <Composer conversationId={selectedId} title={selected.title} />
        </section>
      </div>
    </>
  );
}
