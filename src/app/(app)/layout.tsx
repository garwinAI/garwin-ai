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
import { getWorkspaceLayout } from "@/server/services/workspace";
import { getTheme } from "@/lib/app-icons";
import { themeStyle } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Admins get an "update available" notification wherever they are (GitHub answer cached 60s).
  if (user.role === "admin") await checkForUpdate(60);
  const [ent, apps, jar, assistant, workspaces, unread, pendingView, activeViews, layout] = await Promise.all([
    getEntitlements(user),
    listInstalledApps(user),
    cookies(),
    getAssistantStatus(),
    listMemberships(user.id),
    unreadCount(user.id),
    pendingRequestFor(user.id),
    activeViewsOf(user.id),
    getWorkspaceLayout(user),
  ]);
  // The first page's theme recolors buttons and accents across the app (each page shows its own).
  const theme = getTheme(layout.pages[0].theme);
  const pages = layout.pages.map((p) => ({ id: p.id, name: p.name }));
  const activeApps = apps.filter((a) => a.active).map((a) => a.app.slug);

  return (
    <div className="contents" style={themeStyle(theme.accent) as React.CSSProperties} data-theme={theme.slug}>
      <AppShell
        activeApps={activeApps}
        isAdmin={user.role === "admin"}
        permissions={[...ent.permissions]}
        workspaces={workspaces}
        currentAccountId={ent.accountId}
        user={{ name: user.name, email: user.email, planName: ent.isTeamMember ? `${ent.plan.name} (team)` : ent.plan.name }}
        unreadNotifications={unread}
        pages={pages}
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
    </div>
  );
}
