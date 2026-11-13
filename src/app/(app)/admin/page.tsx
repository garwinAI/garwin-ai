import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Bot, LifeBuoy, ListChecks, MessageSquare, Rocket, SquareTerminal, Tag, Eye } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { HEALTH_STYLES } from "@/lib/health";
import { PLAN_ORDER, PLAN_SPEC } from "@/lib/plans";
import { itemListQuery, ticketTone, userListQuery } from "@/lib/admin-dashboard";
import { cn } from "@/components/ui/cn";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { UsersDonut } from "@/components/admin/users-donut";
import { UsersTable } from "@/components/admin/users-table";
import { ItemsTable } from "@/components/admin/items-table";
import { getMemberStats } from "@/server/services/admin-stats";
import { listAppzoneItemsForAdmin, listUsers, userStats } from "@/server/services/admin-users";
import { checkForUpdate } from "@/server/services/app-update";
import { consoleEvents } from "@/server/services/console";
import { getLaunchChecklist } from "@/server/services/launch";
import { listConversations } from "@/server/services/messaging";
import { unreadCount } from "@/server/services/notifications";
import { myRemoteViews } from "@/server/services/support-access";
import { runSystemChecks, getSystemHealth } from "@/server/services/system";
import { shortSha, updateBlockedReason } from "@/lib/app-update";
import { UpdateAppButton } from "./update-app";

export const metadata: Metadata = { title: "Admin" };

const UPCOMING = [
  { name: "Support tickets", phase: 6 },
  { name: "Developer applications", phase: 5 },
  { name: "Analytics", phase: 6 },
];

const TICKET_STYLES = {
  neutral: { dot: "bg-neutral-300", label: "No overdue tickets" },
  "light-green": { dot: "bg-lime-400", label: "Waiting over 24 hours" },
  orange: { dot: "bg-orange-500", label: "Waiting over 48 hours" },
  red: { dot: "bg-red-600", label: "Waiting over 72 hours" },
};

/** A block in the dashboard grid. `span` sets its width (and height) on desktop. */
function Block({ title, icon: Icon, className, children, id, action }: { title: string; icon?: typeof Bell; className?: string; children: React.ReactNode; id?: string; action?: React.ReactNode }) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z]+/g, "-")}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("card flex min-w-0 scroll-mt-20 flex-col p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 font-semibold">
          {Icon && <Icon className="h-4 w-4 text-neutral-500" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  const uq = userListQuery.parse(params);
  const iq = itemListQuery.parse(params);

  // Log health color changes and overdue-ticket reminders for Console, then read current state.
  const health = (await runSystemChecks()) ?? (await getSystemHealth());
  const [stats, memberStats, users, items, update, launch, notes, conversations, remote, recent] = await Promise.all([
    userStats(admin),
    getMemberStats(),
    listUsers(admin, uq),
    listAppzoneItemsForAdmin(admin, iq),
    checkForUpdate(),
    getLaunchChecklist(admin),
    unreadCount(admin.id),
    listConversations(admin).catch(() => []),
    myRemoteViews(admin),
    consoleEvents(admin, { limit: 8 }),
  ]);
  const style = HEALTH_STYLES[health.level];
  const tone = ticketTone(health.tickets);
  const unreadMessages = conversations.reduce((n, c) => n + c.unread, 0);
  const launchDone = launch.filter((i) => i.done).length;
  const available = update.state === "update_available" ? update : null;

  return (
    <>
      <PageHeader title="Admin" description="Run Garwin AI: members, plans, marketplace, support and system health." />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* --- System health (wide) */}
          <Block title="System health" className={cn("md:col-span-2", style.badge)} id="health">
            <div className="flex items-center gap-5">
              <span className={cn("h-16 w-16 shrink-0 rounded-full shadow-inner ring-4 ring-white", style.dot)} aria-hidden="true" />
              <div>
                <p className="text-xl font-semibold">{style.label}</p>
                {health.reasons.length === 0 ? (
                  <p className="text-sm">All systems normal. Nothing needs doing.</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm font-medium">What the app needs:</p>
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {health.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
            <Link href="/admin/launch" className="mt-3 inline-block text-sm font-medium underline">How to fix: launch checklist</Link>
          </Block>

          {/* --- Users donut (tall) */}
          <Block title="Users" className="md:col-span-2 xl:row-span-2" id="user-stats">
            <UsersDonut total={stats.total} paid={stats.paid} free={stats.free} />
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLAN_ORDER.map((id) => (
                <div key={id} className="rounded-lg bg-neutral-50 p-3">
                  <p className="text-xs text-neutral-500">{PLAN_SPEC[id].name}</p>
                  <p className="text-lg font-semibold">{memberStats.perPlan[id] ?? 0}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Paid and free count each person by their own workspace&apos;s plan. Plan boxes count workspaces. {memberStats.teamMembers} team
              member{memberStats.teamMembers === 1 ? "" : "s"} · {memberStats.developers} approved developer{memberStats.developers === 1 ? "" : "s"}.
            </p>
          </Block>

          {/* --- Support tickets */}
          <Block title="Support tickets" icon={LifeBuoy} id="tickets">
            <div className="flex items-center gap-3">
              <span className={cn("h-8 w-8 shrink-0 rounded-full", TICKET_STYLES[tone].dot)} aria-hidden="true" />
              <div>
                <p className="text-2xl font-semibold">{health.tickets.total}</p>
                <p className="text-xs text-neutral-500">unanswered · {TICKET_STYLES[tone].label}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              <li className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lime-400" aria-hidden="true" />24–48 h</span><span>{health.tickets.over24}</span></li>
              <li className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden="true" />48–72 h</span><span>{health.tickets.over48}</span></li>
              <li className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />72 h+</span><span>{health.tickets.over72}</span></li>
            </ul>
          </Block>

          {/* --- Inbox */}
          <Block title="Your inbox" icon={Bell} id="inbox">
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/notifications" className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 hover:bg-neutral-100">
                  <span className="flex items-center gap-2"><Bell className="h-4 w-4" aria-hidden="true" />Notifications</span>
                  <span className="font-semibold">{notes} unread</span>
                </Link>
              </li>
              <li>
                <Link href="/messages" className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 hover:bg-neutral-100">
                  <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" aria-hidden="true" />Messages</span>
                  <span className="font-semibold">{unreadMessages} unread</span>
                </Link>
              </li>
            </ul>
          </Block>

          {/* --- Live activity (Console preview) */}
          <Block
            title="Live activity"
            icon={SquareTerminal}
            className="md:col-span-2 xl:col-span-3"
            id="activity"
            action={<ButtonLink href="/console" variant="secondary" size="sm">Open Console</ButtonLink>}
          >
            <ol className="space-y-1 rounded-lg bg-neutral-950 p-3 font-mono text-xs text-green-300" aria-label="Latest events">
              {recent.length === 0 && <li className="text-neutral-400">No events yet.</li>}
              {recent.map((l) => (
                <li key={l.id} className="truncate">
                  <span className="text-neutral-400"><LocalTime iso={l.at} /></span> <span className="text-sky-300">{l.category}</span> {l.text}
                </li>
              ))}
            </ol>
          </Block>

          {/* --- Launch checklist */}
          <Block title="Launch checklist" icon={ListChecks} id="launch">
            <p className="text-3xl font-semibold">{launchDone}<span className="text-base font-normal text-neutral-500"> / {launch.length}</span></p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
              <div className="h-full bg-brand-600" style={{ width: `${Math.round((launchDone / launch.length) * 100)}%` }} />
            </div>
            {launchDone < launch.length && <p className="mt-2 text-sm text-neutral-600">Next: {launch.find((i) => !i.done)!.title}</p>}
            <ButtonLink href="/admin/launch" variant="secondary" size="sm" className="mt-3">Open launch checklist</ButtonLink>
          </Block>

          {/* --- App update */}
          <Block title="App update" icon={Rocket} id="app-update" className="md:col-span-2">
            <p className="text-sm text-neutral-600">
              Copies dev.garwinai.com to garwinai.com.
              {available && ` ${available.count} change${available.count === 1 ? "" : "s"} waiting, version ${shortSha(available.devSha)}.`}
            </p>
            {available && available.changes.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-neutral-700">
                {available.changes.slice(0, 4).map((c) => <li key={c.sha} className="break-words">{c.summary}</li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <UpdateAppButton devSha={available?.devSha ?? null} blockedReason={updateBlockedReason(update)} />
              <Link href="/settings/general#deploy" className="text-sm text-brand-700 hover:underline">Schedule a deploy</Link>
            </div>
          </Block>

          {/* --- Tools */}
          <Block title="Tools" id="tools">
            <ul className="space-y-1.5 text-sm">
              <li><Link className="flex items-center gap-2 text-brand-700 hover:underline" href="/console"><SquareTerminal className="h-4 w-4" aria-hidden="true" />Console</Link></li>
              <li><Link className="flex items-center gap-2 text-brand-700 hover:underline" href="/admin/billing"><Tag className="h-4 w-4" aria-hidden="true" />Plans &amp; prices</Link></li>
              <li><Link className="flex items-center gap-2 text-brand-700 hover:underline" href="/admin/billing#stripe-title"><Tag className="h-4 w-4" aria-hidden="true" />Stripe settings</Link></li>
              <li><Link className="flex items-center gap-2 text-brand-700 hover:underline" href="/admin/assistant"><Bot className="h-4 w-4" aria-hidden="true" />Admin Assistant</Link></li>
              {UPCOMING.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2 text-neutral-600">{t.name} <PlannedBadge phase={t.phase} /></li>
              ))}
            </ul>
            {remote.length > 0 && (
              <div className="mt-4 border-t border-neutral-200 pt-3">
                <p className="text-xs font-semibold uppercase text-neutral-500">Your remote views</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {remote.map((r) => (
                    <li key={r.id}>
                      <Link href={`/admin/remote/${r.id}`} className="flex items-center gap-2 text-brand-700 hover:underline">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {r.userName} {r.status === "requested" ? "(waiting)" : "(active)"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Block>

          {/* --- Users list (full width) */}
          <Block title="All users" id="users" className="md:col-span-2 xl:col-span-4">
            <UsersTable rows={users.rows} total={users.total} pageSize={users.pageSize} query={uq} params={params} adminId={admin.id} />
          </Block>

          {/* --- AppZone (full width) */}
          <Block title="AppZone apps, widgets and themes" id="appzone" className="md:col-span-2 xl:col-span-4">
            <ItemsTable rows={items.rows} total={items.total} pageSize={items.pageSize} query={iq} params={params} />
          </Block>
        </div>
      </PageBody>
    </>
  );
}
