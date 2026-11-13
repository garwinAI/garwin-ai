import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, FileText, Folder } from "lucide-react";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getBuiltInApp } from "@/lib/apps";
import { REMOTE_VIEW_SECTIONS, SECTION_LABELS, type RemoteViewSection } from "@/lib/remote-view";
import { uuidSchema } from "@/lib/validation";
import { openRemoteView } from "@/server/services/support-access";
import { getEntitlements, getUsage } from "@/server/services/entitlements";
import { listFolder } from "@/server/services/storage";
import { listInstalledApps } from "@/server/services/apps";
import { getThread, listConversations } from "@/server/services/messaging";
import { listNotifications } from "@/server/services/notifications";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";
import { EndRemoteViewButton } from "./end-button";

export const metadata: Metadata = { title: "Remote view · Admin" };
export const dynamic = "force-dynamic";

type Params = { grantId: string };
type Search = { section?: string; folder?: string; c?: string };

// READ-ONLY by design: this page only calls read functions, with the account owner's identity
// (`actorForReads`) after openRemoteView() has checked the user's approval. No forms except "End".
export default async function RemoteViewPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  const { grantId } = await params;
  const search = await searchParams;
  if (!uuidSchema.safeParse(grantId).success) notFound();
  const section: RemoteViewSection = (REMOTE_VIEW_SECTIONS as readonly string[]).includes(search.section ?? "") ? (search.section as RemoteViewSection) : "overview";

  let view;
  try {
    view = await openRemoteView(admin, grantId, section, await requestMeta());
  } catch (err) {
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (view.state === "waiting") {
    return (
      <>
        <PageHeader title="Remote view" description={`Waiting for ${view.owner.name} to accept your request.`} />
        <PageBody>
          <CardSection id="waiting" title="Request sent">
            <p className="text-sm text-neutral-600">
              {view.owner.name} sees a pop-up asking to accept or deny. You&apos;ll get a notification when they answer. Reload this page
              to check.
            </p>
            <div className="mt-4">
              <EndRemoteViewButton grantId={grantId} />
            </div>
          </CardSection>
        </PageBody>
      </>
    );
  }

  const actor = view.actorForReads;
  return (
    <>
      <div role="alert" className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-red-700 px-4 py-2.5 text-sm font-medium text-white sm:px-6">
        <span className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          ADMIN remotely viewing {view.owner.name}&apos;s account (read-only) until <LocalTime iso={view.expiresAt.toISOString()} />
        </span>
        <EndRemoteViewButton grantId={grantId} />
      </div>
      <PageHeader title={`${view.owner.name}'s account`} description={view.owner.email} />
      <PageBody>
        <nav aria-label="Remote view sections" className="flex flex-wrap gap-1">
          {REMOTE_VIEW_SECTIONS.map((s) => (
            <Link
              key={s}
              href={`/admin/remote/${grantId}?section=${s}`}
              aria-current={s === section ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-sm", s === section ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100")}
            >
              {SECTION_LABELS[s]}
            </Link>
          ))}
        </nav>
        {section === "overview" && <Overview actor={actor} />}
        {section === "storage" && <Storage actor={actor} grantId={grantId} folder={search.folder} />}
        {section === "apps" && <Apps actor={actor} />}
        {section === "messages" && <Messages actor={actor} grantId={grantId} conversationId={search.c} />}
        {section === "notifications" && <Notifications userId={actor.id} />}
      </PageBody>
    </>
  );
}

type Actor = { id: string; accountId: string };

async function Overview({ actor }: { actor: Actor }) {
  const [ent, usage] = await Promise.all([getEntitlements(actor), getUsage(actor.accountId)]);
  return (
    <CardSection id="overview" title="Account">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[180px_1fr] sm:gap-y-3">
        <dt className="text-neutral-500">Plan</dt>
        <dd className="mb-2 font-medium sm:mb-0">{ent.plan.name}</dd>
        <dt className="text-neutral-500">Storage used</dt>
        <dd className="mb-2 sm:mb-0">
          {(usage.storageUsedBytes / 1024 ** 3).toFixed(2)} GB of {ent.plan.storageGb} GB
        </dd>
        <dt className="text-neutral-500">Team members</dt>
        <dd className="mb-2 sm:mb-0">
          {usage.teamMembers} of {ent.plan.teamMemberLimit} ({usage.openInvitations} open invitations)
        </dd>
        <dt className="text-neutral-500">Free AppZone downloads used</dt>
        <dd>{usage.freeDownloadsUsed}</dd>
      </dl>
    </CardSection>
  );
}

async function Storage({ actor, grantId, folder }: { actor: Actor; grantId: string; folder?: string }) {
  const parent = folder && uuidSchema.safeParse(folder).success ? folder : null;
  const { items, breadcrumbs } = await listFolder(actor, parent).catch(() => ({ items: [], breadcrumbs: [] }));
  const base = `/admin/remote/${grantId}?section=storage`;
  return (
    <CardSection id="storage" title="Storage">
      <nav aria-label="Folder path" className="mb-3 flex flex-wrap gap-1 text-sm">
        <Link href={base} className="text-brand-700 hover:underline">All files</Link>
        {breadcrumbs.map((b) => (
          <span key={b.id}>
            {" / "}
            <Link href={`${base}&folder=${b.id}`} className="text-brand-700 hover:underline">{b.name}</Link>
          </span>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">This folder is empty.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                {i.kind === "folder" ? <Folder className="h-4 w-4 text-neutral-500" aria-hidden="true" /> : <FileText className="h-4 w-4 text-neutral-500" aria-hidden="true" />}
                {i.kind === "folder" ? <Link href={`${base}&folder=${i.id}`} className="text-brand-700 hover:underline">{i.name}</Link> : i.name}
                {i.markedForDeletionAt && <Badge tone="danger">Marked for deletion</Badge>}
              </span>
              <span className="text-neutral-500"><LocalTime iso={i.updatedAt.toISOString()} /></span>
            </li>
          ))}
        </ul>
      )}
    </CardSection>
  );
}

async function Apps({ actor }: { actor: Actor }) {
  const apps = await listInstalledApps(actor);
  return (
    <CardSection id="apps" title="Apps">
      <ul className="divide-y divide-neutral-100 text-sm">
        {apps.map((a) => (
          <li key={a.app.slug} className="flex items-center justify-between py-2">
            {getBuiltInApp(a.app.slug)?.name ?? a.app.slug}
            <Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Active" : "Deactivated"}</Badge>
          </li>
        ))}
      </ul>
    </CardSection>
  );
}

async function Messages({ actor, grantId, conversationId }: { actor: Actor; grantId: string; conversationId?: string }) {
  const conversations = await listConversations(actor);
  const open = conversationId && conversations.some((c) => c.id === conversationId) ? conversationId : null;
  const thread = open ? await getThread(actor, open, { markRead: false }) : null;
  return (
    <CardSection id="messages" title="Messages">
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ul className="space-y-1 text-sm" aria-label="Conversations">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/remote/${grantId}?section=messages&c=${c.id}`}
                aria-current={c.id === open ? "true" : undefined}
                className={cn("flex justify-between rounded-lg px-3 py-2", c.id === open ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50")}
              >
                {c.title} {c.unread > 0 && <Badge tone="brand">{c.unread} unread</Badge>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="min-w-0">
          {!thread ? (
            <p className="text-sm text-neutral-500">Choose a conversation. Opening it doesn&apos;t mark anything as read.</p>
          ) : thread.messages.length === 0 ? (
            <p className="text-sm text-neutral-500">No messages.</p>
          ) : (
            <ol className="space-y-3 text-sm">
              {thread.messages.map((m) => (
                <li key={m.id}>
                  <p className="text-xs text-neutral-500">
                    {m.senderName ?? "Garwin AI"} · <LocalTime iso={m.createdAt.toISOString()} />
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </CardSection>
  );
}

async function Notifications({ userId }: { userId: string }) {
  const items = await listNotifications(userId, 50);
  return (
    <CardSection id="notifications" title="Notifications">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">No notifications.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 text-sm">
          {items.map((n) => (
            <li key={n.id} className="py-2">
              <p className="font-medium">
                {n.title} {!n.readAt && <Badge tone="brand">Unread</Badge>}
              </p>
              {n.body && <p className="text-neutral-600">{n.body}</p>}
              <p className="text-xs text-neutral-500"><LocalTime iso={n.createdAt.toISOString()} /></p>
            </li>
          ))}
        </ul>
      )}
    </CardSection>
  );
}
