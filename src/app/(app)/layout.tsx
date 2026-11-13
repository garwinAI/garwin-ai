import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements, listMemberships } from "@/server/services/entitlements";
import { listInstalledApps } from "@/server/services/apps";
import { AppShell } from "@/components/shell/app-shell";
import { SIDEBAR_COOKIE } from "@/components/shell/nav";
import { AssistantFab } from "@/components/assistant/assistant-fab";
import { VerifyBanner } from "@/components/auth/verify-banner";
import { getAssistantStatus } from "@/server/services/assistant";
import { checkForUpdate } from "@/server/services/app-update";
import { unreadCount } from "@/server/services/notifications";
import { activeViewsOf, pendingRequestFor } from "@/server/services/support-access";
import { REMOTE_VIEW_MINUTES } from "@/lib/remote-view";
import { RemoteViewRequestDialog } from "@/components/remote-view/request-dialog";
import { BeingViewedBanner } from "@/components/remote-view/viewed-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Admins get an "update available" notification wherever they are (GitHub answer cached 60s).
  if (user.role === "admin") await checkForUpdate(60);
  const [ent, apps, jar, assistant, workspaces, unread, pendingView, activeViews] = await Promise.all([
    getEntitlements(user),
    listInstalledApps(user),
    cookies(),
    getAssistantStatus(),
    listMemberships(user.id),
    unreadCount(user.id),
    pendingRequestFor(user.id),
    activeViewsOf(user.id),
  ]);
  const activeApps = apps.filter((a) => a.active).map((a) => a.app.slug);

  return (
    <>
      <AppShell
        activeApps={activeApps}
        isAdmin={user.role === "admin"}
        permissions={[...ent.permissions]}
        workspaces={workspaces}
        currentAccountId={ent.accountId}
        user={{ name: user.name, email: user.email, planName: ent.isTeamMember ? `${ent.plan.name} (team)` : ent.plan.name }}
        unreadNotifications={unread}
        initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "1"}
      >
        {activeViews.map((v) => (
          <BeingViewedBanner key={v.id} grantId={v.id} adminName={v.adminName} until={v.expiresAt!.toISOString()} />
        ))}
        {!user.emailVerifiedAt && <VerifyBanner email={user.email} />}
        {children}
      </AppShell>
      {/* Assistant can't be deactivated, so the floating button is always available. */}
      <AssistantFab userName={user.name} status={assistant} />
      {pendingView && (
        <RemoteViewRequestDialog key={pendingView.id} grantId={pendingView.id} adminName={pendingView.adminName} reason={pendingView.reason} minutes={REMOTE_VIEW_MINUTES} />
      )}
    </>
  );
}
