import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { listInstalledApps } from "@/server/services/apps";
import { AppShell } from "@/components/shell/app-shell";
import { SIDEBAR_COOKIE } from "@/components/shell/nav";
import { AssistantFab } from "@/components/assistant/assistant-fab";
import { getAssistantStatus } from "@/server/services/assistant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ plan }, apps, jar, assistant] = await Promise.all([
    getEntitlements(user),
    listInstalledApps(user),
    cookies(),
    getAssistantStatus(),
  ]);
  const activeApps = apps.filter((a) => a.active).map((a) => a.app.slug);

  return (
    <>
      <AppShell
        activeApps={activeApps}
        isAdmin={user.role === "admin"}
        user={{ name: user.name, email: user.email, planName: plan.name }}
        initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "1"}
      >
        {children}
      </AppShell>
      {/* Assistant can't be deactivated, so the floating button is always available. */}
      <AssistantFab userName={user.name} status={assistant} />
    </>
  );
}
