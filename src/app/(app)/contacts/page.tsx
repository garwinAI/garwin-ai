import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { isAppActive } from "@/server/services/apps";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeactivatedApp } from "@/components/deactivated-app";
import { NoAccess } from "@/components/no-access";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const user = await requireUser();
  if (!(await isAppActive(user, "contacts"))) {
    return <DeactivatedApp name="Contacts" canManage={(await getEntitlements(user)).canManageApps} />;
  }
  if (!(await getEntitlements(user)).can("contacts.view")) return <NoAccess title="Contacts" what="view contacts" />;
  return (
    <>
      <PageHeader title="Contacts" description="People you work with." actions={<PlannedBadge phase={3} />} />
      <PageBody>
        <EmptyState
          icon={Users}
          title="No contacts yet"
          body="Adding contacts arrives with the core apps. Contacts will be searchable and available to the Assistant."
        />
      </PageBody>
    </>
  );
}
