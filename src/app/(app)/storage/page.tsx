import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FolderOpen, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { getEntitlements, getUsage } from "@/server/services/entitlements";
import { isAppActive } from "@/server/services/apps";
import { listFolder, listMarkedForDeletion } from "@/server/services/storage";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, PlannedBadge } from "@/components/ui/badge";
import { DeactivatedApp } from "@/components/deactivated-app";
import { NoAccess } from "@/components/no-access";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";
import { CreateFolderForm, ItemActions } from "./storage-forms";

export const metadata: Metadata = { title: "Storage" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export default async function StoragePage({ searchParams }: Props) {
  const user = await requireUser();
  const ent = await getEntitlements(user);
  if (!(await isAppActive(user, "storage"))) return <DeactivatedApp name="Storage" canManage={ent.canManageApps} />;
  if (!ent.can("storage.view")) return <NoAccess title="Storage" what="view files" />;

  const params = await searchParams;
  const showMarked = params.view === "marked";
  const folderParam = typeof params.folder === "string" && uuidSchema.safeParse(params.folder).success ? params.folder : null;

  const [usage, listing, marked] = await Promise.all([
    getUsage(ent.accountId),
    showMarked ? null : listFolder(user, folderParam).catch(() => null),
    listMarkedForDeletion(user),
  ]);
  const pct = Math.min(100, (usage.storageUsedBytes / ent.plan.storageBytes) * 100);
  const can = {
    upload: ent.can("storage.upload"),
    mark: ent.can("storage.mark_for_deletion"),
    delete: ent.canPermanentlyDelete,
  };

  return (
    <>
      <PageHeader
        title="Storage"
        description={ent.isTeamMember ? "Files shared with your team. Your host's storage." : "Files shared between you and your team."}
        actions={<PlannedBadge phase={3} />}
      />
      <PageBody>
        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">Storage used</p>
            <p className="text-sm text-neutral-500">
              <span className="font-medium text-neutral-900">{formatBytes(usage.storageUsedBytes)}</span> of {ent.plan.storageGb} GB ({ent.plan.name}
              {ent.isTeamMember ? ", shared with your team" : ""})
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Storage used" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(pct, 0.5)}%` }} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">File uploads arrive once cloud file storage is connected. Folders and deletion rules work now.</p>
        </Card>

        <nav aria-label="Storage views" className="flex gap-2">
          <Link href="/storage" aria-current={!showMarked ? "page" : undefined} className={cn("rounded-full border px-4 py-1.5 text-sm", !showMarked ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white")}>
            All files
          </Link>
          <Link href="/storage?view=marked" aria-current={showMarked ? "page" : undefined} className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm", showMarked ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white")}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Marked for deletion
            {marked.length > 0 && <Badge tone="accent">{marked.length}</Badge>}
          </Link>
        </nav>

        {showMarked ? (
          <section aria-labelledby="marked-title" className="card">
            <h2 id="marked-title" className="border-b border-neutral-200 px-5 py-4 font-semibold">
              Marked for deletion
            </h2>
            {marked.length === 0 ? (
              <p className="px-5 py-6 text-sm text-neutral-500">Nothing is waiting for review.</p>
            ) : (
              <ul className="divide-y divide-neutral-100" aria-label="Marked items">
                {marked.map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-neutral-500">
                        Marked by {o.markedByName ?? "a former member"} · <LocalTime iso={o.markedForDeletionAt!.toISOString()} />
                      </p>
                    </div>
                    <ItemActions id={o.id} name={o.name} marked markedByMe={o.markedForDeletionBy === user.id} can={can} />
                  </li>
                ))}
              </ul>
            )}
            {!can.delete && marked.length > 0 && <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500">Only the host can delete items permanently.</p>}
          </section>
        ) : !listing ? (
          <EmptyState icon={FolderOpen} title="Folder not found" body="It may have been deleted." action={<Link href="/storage" className="btn-secondary">Back to Storage</Link>} />
        ) : (
          <section aria-labelledby="folder-title" className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <nav aria-label="Folder path" className="text-sm">
                <ol className="flex flex-wrap items-center gap-1">
                  <li>
                    <Link href="/storage" className="font-medium text-brand-700 hover:underline" id={listing.breadcrumbs.length === 0 ? "folder-title" : undefined}>
                      All files
                    </Link>
                  </li>
                  {listing.breadcrumbs.map((b, i) => (
                    <li key={b.id} className="flex items-center gap-1">
                      <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                      {i === listing.breadcrumbs.length - 1 ? (
                        <span id="folder-title" aria-current="page" className="font-medium">{b.name}</span>
                      ) : (
                        <Link href={`/storage?folder=${b.id}`} className="text-brand-700 hover:underline">{b.name}</Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
              {can.upload && <CreateFolderForm parentId={folderParam ?? ""} />}
            </div>
            {listing.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-neutral-500">This folder is empty.</p>
            ) : (
              <ul className="divide-y divide-neutral-100" aria-label="Folder contents">
                {listing.items.map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3 text-sm">
                      <FolderOpen className={cn("h-5 w-5 shrink-0", o.markedForDeletionAt ? "text-neutral-300" : "text-brand-600")} aria-hidden="true" />
                      <div className="min-w-0">
                        {o.kind === "folder" ? (
                          <Link href={`/storage?folder=${o.id}`} className="truncate font-medium hover:underline">{o.name}</Link>
                        ) : (
                          <span className="truncate font-medium">{o.name}</span>
                        )}
                        {o.markedForDeletionAt && (
                          <p className="text-xs text-accent-700">Marked for deletion by {o.markedByName ?? "a former member"}</p>
                        )}
                      </div>
                    </div>
                    <ItemActions id={o.id} name={o.name} marked={Boolean(o.markedForDeletionAt)} markedByMe={o.markedForDeletionBy === user.id} can={can} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </PageBody>
    </>
  );
}
