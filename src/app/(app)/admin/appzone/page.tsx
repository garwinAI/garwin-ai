import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { itemTypeLabel, uploadFeeFor } from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { listDeveloperApplications, listReviewQueue } from "@/server/services/appzone";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { DeveloperDecisionForm } from "./forms";

export const metadata: Metadata = { title: "AppZone review" };

export default async function AdminAppZonePage() {
  const admin = await requireAdmin();
  const [queue, developers] = await Promise.all([listReviewQueue(admin), listDeveloperApplications(admin)]);
  const pendingDevs = developers.filter((d) => d.profile.status === "pending");
  const otherDevs = developers.filter((d) => d.profile.status !== "pending");

  return (
    <>
      <PageHeader title="AppZone review" description="Approve or deny uploads and developer applications. Fees are charged only on approval." />
      <PageBody>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin
        </Link>

        <CardSection id="queue" title="Uploads waiting" description={`${queue.length} waiting`}>
          {queue.length === 0 ? (
            <div><EmptyState icon={Inbox} title="Nothing to review" body="New items and newer versions show up here." /></div>
          ) : (
            <ul className="-mx-4 -my-5 divide-y divide-neutral-200 sm:-mx-6">
              {queue.map((q) => {
                const purpose = q.itemStatus === "published" ? "update" : "listing";
                return (
                  <li key={q.versionId}>
                    <Link href={`/admin/appzone/review/${q.versionId}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-neutral-50 sm:px-6">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{q.name} <span className="font-normal text-neutral-500">{q.version}</span></span>
                        <span className="block text-sm text-neutral-500">{q.developer} · {itemTypeLabel(q.kind, q.appType)}</span>
                      </span>
                      <Badge tone={purpose === "update" ? "brand" : "accent"}>{purpose === "update" ? "Newer version" : "New item"}</Badge>
                      <span className="text-sm text-neutral-600">{formatPrice(uploadFeeFor(q.kind, purpose))} on approval</span>
                      {q.submittedAt && <span className="text-xs text-neutral-500"><LocalTime iso={q.submittedAt.toISOString()} /></span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardSection>

        <CardSection id="developers" title="Developer applications" description={`${pendingDevs.length} waiting`}>
          {pendingDevs.length === 0 ? (
            <p className="text-sm text-neutral-500">No applications waiting.</p>
          ) : (
            <ul className="-mx-4 -my-5 divide-y divide-neutral-200 sm:-mx-6">
              {pendingDevs.map(({ profile, userName, userEmail }) => (
                <li key={profile.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_minmax(0,20rem)] sm:px-6">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-medium">{profile.displayName}</p>
                    <p className="text-neutral-500">{userName} · {userEmail}</p>
                    {profile.website && <p className="break-all text-neutral-500">{profile.website}</p>}
                    {profile.applicationNote && <p className="whitespace-pre-line text-neutral-700">{profile.applicationNote}</p>}
                  </div>
                  <DeveloperDecisionForm profileId={profile.id} />
                </li>
              ))}
            </ul>
          )}
          {otherDevs.length > 0 && (
            <details className="-mx-4 -mb-5 mt-5 border-t border-neutral-200 px-4 py-4 text-sm sm:-mx-6 sm:px-6">
              <summary className="cursor-pointer text-neutral-600">Reviewed developers ({otherDevs.length})</summary>
              <ul className="mt-3 space-y-1">
                {otherDevs.map(({ profile, userEmail }) => (
                  <li key={profile.id} className="flex flex-wrap items-center gap-2">
                    {profile.displayName} <span className="text-neutral-500">{userEmail}</span>
                    <Badge tone={profile.status === "approved" ? "success" : "danger"}>{profile.status === "approved" ? "Approved" : "Denied"}</Badge>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardSection>
      </PageBody>
    </>
  );
}
