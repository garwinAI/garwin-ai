import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS } from "@/lib/apps";
import { getEntitlements, getUsage } from "@/server/services/entitlements";
import { listInstalledApps } from "@/server/services/apps";
import { getWorkspaceLayout } from "@/server/services/workspace";
import { WorkspaceEditor, type AppEntry } from "@/components/workspace/workspace-editor";

export const metadata: Metadata = { title: "Workspace" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function WorkspacePage({ searchParams }: Props) {
  const user = await requireUser();
  const [ent, layout, installed, params] = await Promise.all([getEntitlements(user), getWorkspaceLayout(user), listInstalledApps(user), searchParams]);
  const usage = await getUsage(ent.accountId);
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
      storage={{ usedBytes: usage.storageUsedBytes, limitGb: ent.plan.storageGb, driveName: ent.isTeamMember ? "Team drive" : "My drive" }}
    />
  );
}
