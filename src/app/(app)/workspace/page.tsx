import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS } from "@/lib/apps";
import { getEntitlements, getUsage } from "@/server/services/entitlements";
import { listInstalledApps } from "@/server/services/apps";
import { getWorkspaceLayout } from "@/server/services/workspace";
import { WorkspaceEditor, type AppEntry } from "@/components/workspace/workspace-editor";
import type { Feeds } from "@/components/workspace/feeds";
import { listNotifications, unreadCount } from "@/server/services/notifications";
import { listConversations } from "@/server/services/messaging";
import { listMyTickets } from "@/server/services/support";

export const metadata: Metadata = { title: "Workspace" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function WorkspacePage({ searchParams }: Props) {
  const user = await requireUser();
  const [ent, layout, installed, params] = await Promise.all([getEntitlements(user), getWorkspaceLayout(user), listInstalledApps(user), searchParams]);
  const canMessage = ent.can("messages.use") && installed.some((i) => i.app.slug === "messages" && i.active);
  const [usage, notes, unread, conversations, tickets] = await Promise.all([
    getUsage(ent.accountId),
    listNotifications(user.id, 10),
    unreadCount(user.id),
    canMessage ? listConversations(user) : Promise.resolve(null),
    listMyTickets(user),
  ]);
  const feeds: Feeds = {
    notifications: notes.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: Boolean(n.readAt) })),
    unreadNotifications: unread,
    conversations: conversations?.map((c) => ({ id: c.id, title: c.title, unread: Number(c.unread), lastMessageAt: c.lastMessageAt?.toISOString() ?? null })) ?? null,
    tickets: tickets.slice(0, 10).map((t) => ({ id: t.id, subject: t.subject, status: t.status, updatedAt: t.updatedAt.toISOString() })),
  };
  const bySlug = new Map(installed.map((i) => [i.app.slug, i]));
  const apps: AppEntry[] = BUILT_IN_APPS.map((a) => {
    const inst = bySlug.get(a.slug);
    return {
      slug: a.slug,
      name: a.name,
      href: a.href ?? `/apps/${a.slug}`,
      built: Boolean(a.href),
      icon: a.icon,
      canDeactivate: a.canDeactivate,
      status: !inst ? "locked" : inst.active ? "active" : "deactivated",
    };
  });
  const pageId = typeof params.page === "string" ? params.page : null;
  return (
    <WorkspaceEditor
      initial={layout}
      initialPageId={pageId}
      apps={apps}
      canManageApps={ent.canManageApps}
      canManageBilling={ent.canManageBilling}
      feeds={feeds}
      storage={{ usedBytes: usage.storageUsedBytes, limitGb: ent.plan.storageGb, driveName: ent.isTeamMember ? "Team drive" : "My drive" }}
    />
  );
}
