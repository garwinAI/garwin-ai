import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { isAppActive } from "@/server/services/apps";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DeactivatedApp } from "@/components/deactivated-app";

export const metadata: Metadata = { title: "Storage" };

export default async function StoragePage() {
  const user = await requireUser();
  const ent = await getEntitlements(user);
  if (!(await isAppActive(user, "storage"))) {
    return <DeactivatedApp name="Storage" canManage={ent.canManageApps} />;
  }
  return (
    <>
      <PageHeader title="Storage" description="Files shared between you and your team." actions={<PlannedBadge phase={3} />} />
      <PageBody>
        <Card className="flex flex-wrap items-baseline justify-between gap-2 p-5">
          <p className="font-medium">Storage included</p>
          <p className="text-sm text-neutral-500">
            <span className="font-medium text-neutral-900">{ent.plan.storageGb} GB</span> on the {ent.plan.name} plan
            {ent.isTeamMember ? ", shared with your team" : ""}
          </p>
        </Card>
        <EmptyState
          icon={FolderOpen}
          title="No files yet"
          body="Uploading arrives with the core apps, along with a usage meter. Team members can mark files for deletion; only the host can delete them permanently."
        />
      </PageBody>
    </>
  );
}
