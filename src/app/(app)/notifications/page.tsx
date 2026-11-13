import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { checkForUpdate } from "@/server/services/app-update";
import { listNotifications } from "@/server/services/notifications";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { MarkAllReadButton } from "./mark-read";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  // Admins: make sure a pending app update shows up here even if nothing else has checked yet.
  if (user.role === "admin") await checkForUpdate(60);
  const items = await listNotifications(user.id, 50);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader title="Notifications" description="Your most recent 50 notifications." actions={<MarkAllReadButton disabled={unread === 0} />} />
      <PageBody>
        {items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" body="Messages, team changes and updates will appear here." />
        ) : (
          <ul className="card divide-y divide-neutral-200">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3 sm:px-6">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent-500"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.readAt ? "text-neutral-700" : "font-medium text-neutral-900"}`}>
                    {!n.readAt && <span className="sr-only">Unread: </span>}
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body && <p className="mt-0.5 break-words text-sm text-neutral-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-neutral-500">
                    <LocalTime iso={n.createdAt.toISOString()} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
