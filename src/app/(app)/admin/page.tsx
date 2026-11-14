import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Bell, Bot, CalendarDays, LifeBuoy, ListChecks, MessageSquare, Rocket, Server, SquareTerminal, Tag, Eye, TrendingUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { HEALTH_STYLES } from "@/lib/health";
import { PLAN_ORDER, PLAN_SPEC } from "@/lib/plans";
import { itemListQuery, ticketTone, userListQuery } from "@/lib/admin-dashboard";
import { autopilotSentence } from "@/lib/autopilot";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/components/ui/cn";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Badge, PlannedBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { UsersDonut } from "@/components/admin/users-donut";
import { DailyBars } from "@/components/admin/daily-bars";
import { ServerRack } from "@/components/admin/server-rack";
import { MiniCalendar } from "@/components/admin/mini-calendar";
import { AutopilotToggle } from "@/components/admin/autopilot-toggle";
import { UsersTable } from "@/components/admin/users-table";
import { ItemsTable } from "@/components/admin/items-table";
import { getMemberStats } from "@/server/services/admin-stats";
import { listAppzoneItemsForAdmin, listUsers, userStats } from "@/server/services/admin-users";
import { checkForUpdate } from "@/server/services/app-update";
import { autopilotConfigured, autopilotStats, getAutopilot, runAutopilot } from "@/server/services/autopilot";
import { consoleEvents } from "@/server/services/console";
import { growthStats, serverStats, upcomingEvents } from "@/server/services/dashboard";
import { getLaunchChecklist } from "@/server/services/launch";
import { listConversations } from "@/server/services/messaging";
import { listNotifications, unreadCount } from "@/server/services/notifications";
import { ticketSummary } from "@/server/services/support";
import { myRemoteViews } from "@/server/services/support-access";
import { runSystemChecks, getSystemHealth } from "@/server/services/system";
import { shortSha, updateBlockedReason } from "@/lib/app-update";
import { UpdateAppButton } from "./update-app";

export const metadata: Metadata = { title: "Admin" };

const UPCOMING = [
  { name: "Developer applications", phase: 5 },
  { name: "Analytics", phase: 6 },
];

const TICKET_STYLES = {
  neutral: { dot: "bg-neutral-300", label: "None waiting over 24 h" },
  "light-green": { dot: "bg-lime-400", label: "Waiting over 24 hours" },
  orange: { dot: "bg-orange-500", label: "Waiting over 48 hours" },
  red: { dot: "bg-red-600", label: "Waiting over 72 hours" },
};

const EVENT_DOT = { deploy: "bg-brand-600", remote: "bg-red-600", billing: "bg-accent-500" } as const;

/** A block in the dashboard grid. Width (and height) on desktop come from `className`. */
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
  // Auto Pilot answers any waiting tickets after this page is sent.
  after(() => runAutopilot().then(() => undefined));

  const [stats, memberStats, users, items, update, launch, notes, latestNotes, conversations, remote, recent, growth, server, autopilot, apStats, tickets, upcoming] =
    await Promise.all([
      userStats(admin),
      getMemberStats(),
      listUsers(admin, uq),
      listAppzoneItemsForAdmin(admin, iq),
      checkForUpdate(),
      getLaunchChecklist(admin),
      unreadCount(admin.id),
      listNotifications(admin.id, 4),
      listConversations(admin).catch(() => []),
      myRemoteViews(admin),
      consoleEvents(admin, { limit: 8 }),
      growthStats(admin),
      serverStats(admin),
      getAutopilot(),
      autopilotStats(),
      ticketSummary(admin),
      upcomingEvents(admin),
    ]);
  const style = HEALTH_STYLES[health.level];
  const tone = ticketTone(health.tickets);
  const unreadMessages = conversations.reduce((n, c) => n + c.unread, 0);
  const launchDone = launch.filter((i) => i.done).length;
  const available = update.state === "update_available" ? update : null;
  const now = new Date();
  const periods = [
    { key: "day", label: "Today", sub: "last 24 h" },
    { key: "week", label: "Week", sub: "last 7 days" },
    { key: "month", label: "Month", sub: "last 30 days" },
    { key: "year", label: "Year", sub: "last 365 days" },
  ] as const;
  const canAutopilot = autopilotConfigured();

  return (
    <>
      <PageHeader title="Admin" description="Run Garwin AI: members, plans, marketplace, support and system health." />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* ---------------- Row 1: health + money */}
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

          <Block title="Plan upgrades & revenue" icon={TrendingUp} className="md:col-span-2" id="growth">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {periods.map((p) => (
                <div key={p.key} className="rounded-xl bg-gradient-to-br from-neutral-50 to-white p-3 ring-1 ring-neutral-200">
                  <dt className="text-xs font-medium text-neutral-500">
                    {p.label} <span className="font-normal">· {p.sub}</span>
                  </dt>
                  <dd className="mt-1">
                    <span className="block text-xl font-semibold tabular-nums">{formatPrice(growth.revenueCents[p.key])}</span>
                    <span className="text-xs text-neutral-600">
                      <span className="font-semibold text-neutral-900">{growth.upgrades[p.key]}</span> upgrade{growth.upgrades[p.key] === 1 ? "" : "s"}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-neutral-500">Revenue = paid subscription invoices (Stripe). Upgrades = new paid plans and moves to a higher plan.</p>
          </Block>

          {/* ---------------- Row 2: users + server */}
          <Block title="Users" className="md:col-span-2" id="user-stats">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <UsersDonut total={stats.total} paid={stats.paid} free={stats.free} />
              <div className="grid flex-1 grid-cols-2 gap-2">
                {PLAN_ORDER.map((id) => (
                  <div key={id} className="rounded-lg bg-neutral-50 p-2.5">
                    <p className="text-xs text-neutral-500">{PLAN_SPEC[id].name}</p>
                    <p className="text-lg font-semibold">{memberStats.perPlan[id] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <DailyBars data={growth.daily} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Paid / free count each person by their own workspace&apos;s plan; plan boxes count workspaces. {memberStats.teamMembers} team member
              {memberStats.teamMembers === 1 ? "" : "s"} · {memberStats.developers} approved developer{memberStats.developers === 1 ? "" : "s"}.
            </p>
          </Block>

          <Block title="Server" icon={Server} className="md:col-span-2" id="server">
            <ServerRack stats={server} online={health.level !== "red"} />
          </Block>

          {/* ---------------- Row 3: assistant + calendar + support */}
          <Block
            title="Admin Assistant"
            icon={Bot}
            className="md:col-span-2"
            id="assistant"
            action={
              <span className="flex gap-2">
                <ButtonLink href="/admin/assistant" size="sm">Open</ButtonLink>
                <ButtonLink href="/admin/assistant/log" variant="secondary" size="sm">View chat log</ButtonLink>
              </span>
            }
          >
            <p className="text-sm text-neutral-600">Ask for any change to the website; it&apos;s made on the dev site for you to check, then publish.</p>
            <div className={cn("mt-4 rounded-xl p-4 ring-1", autopilot.on ? "bg-green-50 ring-green-200" : "bg-neutral-50 ring-neutral-200")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <span className={cn("h-2.5 w-2.5 rounded-full", autopilot.on ? "bg-green-600 motion-safe:animate-pulse" : "bg-neutral-400")} aria-hidden="true" />
                    Auto Pilot
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-700" data-testid="autopilot-status">{autopilotSentence(autopilot)}</p>
                </div>
                <AutopilotToggle on={autopilot.on} canTurnOn={canAutopilot} />
              </div>
              <p className="mt-2 text-xs text-neutral-600">
                Answers support tickets with Claude, then closes simple ones and escalates the rest to Admins. Last 24 h:{" "}
                <strong>{apStats.closed}</strong> closed, <strong>{apStats.escalated}</strong> escalated.
              </p>
              {!canAutopilot && <p className="mt-1 text-xs font-medium text-red-700">Needs the Claude Console API key (ASSISTANT_API_KEY) before it can be turned on.</p>}
            </div>
          </Block>

          <Block title="Calendar" icon={CalendarDays} id="calendar">
            <MiniCalendar today={now} marked={new Set(upcoming.map((e) => e.at.toISOString().slice(0, 10)))} />
            <p className="mb-1 mt-3 text-xs font-semibold uppercase text-neutral-500">Coming up</p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {upcoming.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", EVENT_DOT[e.kind])} aria-hidden="true" />
                    <span className="min-w-0">
                      {e.href ? <Link href={e.href} className="text-brand-700 underline">{e.title}</Link> : e.title}
                      <span className="block text-xs text-neutral-500">
                        <LocalTime iso={e.at.toISOString()} />{e.detail ? ` · ${e.detail}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-neutral-500">Calendar app events join this list in Phase 3.</p>
          </Block>

          <Block title="Support tickets" icon={LifeBuoy} id="tickets" action={<ButtonLink href="/admin/support" variant="secondary" size="sm">Open</ButtonLink>}>
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
            <p className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <Badge tone={tickets.escalated ? "danger" : "neutral"}>{tickets.escalated} escalated</Badge>
              <Badge tone="warning">{tickets.waiting} waiting on customer</Badge>
              <Badge tone="success">{tickets.resolvedToday} resolved today</Badge>
            </p>
            {tickets.latest.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-2 text-sm">
                {tickets.latest.map((t) => (
                  <li key={t.id} className="truncate">
                    <Link href={`/admin/support/${t.id}`} className="text-brand-700 hover:underline">{t.subject}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {/* ---------------- Row 4: inbox widgets + launch + update */}
          <Block title="Messages" icon={MessageSquare} id="messages" action={<ButtonLink href="/messages" variant="secondary" size="sm">Open</ButtonLink>}>
            <p className="text-2xl font-semibold">{unreadMessages}<span className="ml-1 text-sm font-normal text-neutral-500">unread</span></p>
            <ul className="mt-2 space-y-1 text-sm">
              {conversations.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.title}</span>
                  {c.unread > 0 && <Badge tone="brand">{c.unread}</Badge>}
                </li>
              ))}
              {conversations.length === 0 && <li className="text-neutral-500">No conversations yet.</li>}
            </ul>
          </Block>

          <Block title="Notifications" icon={Bell} id="notifications" action={<ButtonLink href="/notifications" variant="secondary" size="sm">Open</ButtonLink>}>
            <p className="text-2xl font-semibold">{notes}<span className="ml-1 text-sm font-normal text-neutral-500">unread</span></p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {latestNotes.map((n) => (
                <li key={n.id} className="flex gap-2">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-neutral-300" : "bg-brand-600")} aria-hidden="true" />
                  <span className="min-w-0">
                    {n.link ? <Link href={n.link} className="line-clamp-2 hover:underline">{n.title}</Link> : <span className="line-clamp-2">{n.title}</span>}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </span>
                </li>
              ))}
              {latestNotes.length === 0 && <li className="text-neutral-500">Nothing yet.</li>}
            </ul>
          </Block>

          <Block title="Launch checklist" icon={ListChecks} id="launch">
            <p className="text-3xl font-semibold">{launchDone}<span className="text-base font-normal text-neutral-500"> / {launch.length}</span></p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
              <div className="h-full bg-brand-600" style={{ width: `${Math.round((launchDone / launch.length) * 100)}%` }} />
            </div>
            {launchDone < launch.length && <p className="mt-2 text-sm text-neutral-600">Next: {launch.find((i) => !i.done)!.title}</p>}
            <ButtonLink href="/admin/launch" variant="secondary" size="sm" className="mt-3">Open launch checklist</ButtonLink>
          </Block>

          <Block title="App update" icon={Rocket} id="app-update">
            <p className="text-sm text-neutral-600">
              Copies dev.garwinai.com to garwinai.com.
              {available && ` ${available.count} change${available.count === 1 ? "" : "s"} waiting, version ${shortSha(available.devSha)}.`}
            </p>
            {available && available.changes.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-neutral-700">
                {available.changes.slice(0, 3).map((c) => <li key={c.sha} className="break-words">{c.summary}</li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-col items-start gap-2">
              <UpdateAppButton devSha={available?.devSha ?? null} blockedReason={updateBlockedReason(update)} />
              <Link href="/settings/general#deploy" className="text-sm text-brand-700 hover:underline">Schedule a deploy</Link>
            </div>
          </Block>

          {/* ---------------- Row 5: activity + tools */}
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

          <Block title="Tools" id="tools">
            <ul className="space-y-1.5 text-sm">
              <li><Link className="flex items-center gap-2 text-brand-700 hover:underline" href="/console"><SquareTerminal className="h-4 w-4" aria-hidden="true" />Console</Link></li>
              <li><Link className="flex items-center gap-2 text-brand-700 hover:underline" href="/admin/support"><LifeBuoy className="h-4 w-4" aria-hidden="true" />Support tickets</Link></li>
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

          {/* ---------------- Lists */}
          <Block title="All users" id="users" className="md:col-span-2 xl:col-span-4">
            <UsersTable rows={users.rows} total={users.total} pageSize={users.pageSize} query={uq} params={params} adminId={admin.id} />
          </Block>

          <Block title="AppZone apps, widgets and themes" id="appzone" className="md:col-span-2 xl:col-span-4">
            <ItemsTable rows={items.rows} total={items.total} pageSize={items.pageSize} query={iq} params={params} />
          </Block>
        </div>
      </PageBody>
    </>
  );
}
