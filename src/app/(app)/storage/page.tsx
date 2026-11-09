import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { ComingSoon, EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";

export const metadata: Metadata = { title: "Storage" };

export default async function StoragePage() {
  const user = await requireUser();
  const { plan } = await getEntitlements(user);
    const usedGb = 0;
  const pct = (usedGb / plan.storageGb) * 100;

  return (
    <>
      <PageHeader title="Storage" description="Files shared between you and your team." actions={<ComingSoon phase={3} />} />
      <div className="space-y-6 p-8">
        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <p className="font-medium">Storage used</p>
            <p className="text-sm text-neutral-500">
              <span className="font-medium text-neutral-900">{usedGb} GB</span> of {plan.storageGb} GB ({plan.name})
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(pct, 0.5)}%` }} />
          </div>
        </div>
        <EmptyState
          icon={FolderOpen}
          title="No files yet"
          body="Upload files to keep them in your workspace. Team members can mark files for deletion; only you can delete them permanently."
          action={<button className="btn-primary" disabled>Upload files</button>}
        />
      </div>
    </>
  );
}
