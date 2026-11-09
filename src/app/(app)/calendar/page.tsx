import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { getInstalledApp } from "@/server/services/apps";
import type { CalendarSettings } from "@/lib/apps";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { DeactivatedApp } from "@/components/deactivated-app";
import { MonthView } from "./month-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const user = await requireUser();
  const installed = await getInstalledApp(user, "calendar");
  if (!installed?.active) {
    return <DeactivatedApp name="Calendar" canManage={(await getEntitlements(user)).canManageApps} />;
  }
  const settings = installed.settings as CalendarSettings;
  return (
    <>
      <PageHeader title="Calendar" description="Your schedule. Creating events arrives with the core apps." actions={<PlannedBadge phase={3} />} />
      <PageBody>
        <MonthView weekStartsOn={settings.weekStartsOn} />
      </PageBody>
    </>
  );
}
