// Numbers for the Admin home widgets. Everything comes from real records: the payments ledger,
// the audit log, users, accounts and storage. Nothing is estimated.
import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, payments, subscriptions, supportAccessGrants, users, accounts } from "@/db/schema";
import { ENTITLING_STATUSES } from "@/lib/entitlements";
import { isUpgradeEvent, lastNDays, PERIODS, type Period } from "@/lib/growth";
import { assertAdmin } from "./admin-users";
import { getDeploySchedule } from "./app-update";

type Admin = { id: string; role: string };

/** Paid revenue and plan upgrades for the last day / week / month / year, plus 14 daily bars. */
export async function growthStats(admin: Admin, days = 14) {
  assertAdmin(admin);
  const since = sql`now() - interval '365 days'`;
  const [money, events, signups] = await Promise.all([
    db
      .select({
        day: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.createdAt} > now() - interval '1 day'), 0)::int`,
        week: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.createdAt} > now() - interval '7 days'), 0)::int`,
        month: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.createdAt} > now() - interval '30 days'), 0)::int`,
        year: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
      })
      .from(payments)
      .where(and(eq(payments.kind, "subscription"), eq(payments.status, "succeeded"), gt(payments.createdAt, since))),
    db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(inArray(auditLogs.action, ["subscription.synced", "subscription.plan_changed"]), gt(auditLogs.createdAt, since))),
    db
      .select({ day: sql<string>`to_char(${users.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(users)
      .where(gt(users.createdAt, sql`now() - ${sql.raw(`interval '${days} days'`)}`))
      .groupBy(sql`1`),
  ]);

  const upgrades = events.filter((e) => isUpgradeEvent(e.action, e.metadata ?? {}));
  const now = Date.now();
  const count = (p: Period) => upgrades.filter((u) => now - u.createdAt.getTime() < PERIODS[p] * 86_400_000).length;
  const signupsByDay = new Map(signups.map((s) => [s.day, s.n]));
  const upgradesByDay = new Map<string, number>();
  for (const u of upgrades) {
    const d = u.createdAt.toISOString().slice(0, 10);
    upgradesByDay.set(d, (upgradesByDay.get(d) ?? 0) + 1);
  }
  return {
    revenueCents: money[0],
    upgrades: { day: count("day"), week: count("week"), month: count("month"), year: count("year") },
    daily: lastNDays(days, new Date()).map((d) => ({ day: d, newUsers: signupsByDay.get(d) ?? 0, upgrades: upgradesByDay.get(d) ?? 0 })),
  };
}

/** "Server" widget: database size, storage used vs allocated, files, and AppZone catalogue. */
export async function serverStats(admin: Admin) {
  assertAdmin(admin);
  const entitling = sql.raw(ENTITLING_STATUSES.map((s) => `'${s}'`).join(", "));
  const [db_, storage, objects, items, versions] = await Promise.all([
    db.execute<{ bytes: number }>(sql`select pg_database_size(current_database())::bigint as bytes`),
    db.execute<{ used: number; allocated: number; workspaces: number }>(sql`
      select coalesce(sum(a.storage_used_bytes), 0)::bigint as used,
             coalesce(sum(p.storage_bytes), 0)::bigint as allocated,
             count(*)::int as workspaces
      from accounts a
      join plans p on p.id = coalesce((select s.plan_id from subscriptions s where s.account_id = a.id and s.status in (${entitling}) limit 1), 'free')`),
    db.execute<{ files: number; folders: number; marked: number }>(sql`
      select count(*) filter (where kind = 'file')::int as files, count(*) filter (where kind = 'folder')::int as folders,
             count(*) filter (where marked_for_deletion_at is not null)::int as marked
      from storage_objects`),
    db.execute<{ kind: string; total: number; published: number }>(sql`
      select kind, count(*)::int as total, count(*) filter (where status = 'published')::int as published from appzone_items group by kind`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from appzone_item_versions`),
  ]);
  const kinds = Object.fromEntries(items.rows.map((r) => [r.kind, r])) as Record<string, { total: number; published: number } | undefined>;
  return {
    databaseBytes: Number(db_.rows[0].bytes),
    storage: { used: Number(storage.rows[0].used), allocated: Number(storage.rows[0].allocated), workspaces: storage.rows[0].workspaces },
    files: objects.rows[0],
    appzone: {
      apps: kinds.app ?? { total: 0, published: 0 },
      widgets: kinds.widget ?? { total: 0, published: 0 },
      themes: kinds.theme ?? { total: 0, published: 0 },
      bundles: versions.rows[0].n,
    },
  };
}

export type UpcomingEvent = { at: Date; title: string; detail?: string; href?: string; kind: "deploy" | "remote" | "billing" };

/** Real things coming up that Admins care about. (Calendar app events arrive with Phase 3.) */
export async function upcomingEvents(admin: Admin): Promise<UpcomingEvent[]> {
  assertAdmin(admin);
  const [schedule, views, renewals] = await Promise.all([
    getDeploySchedule(),
    db
      .select({ id: supportAccessGrants.id, expiresAt: supportAccessGrants.expiresAt, name: users.name })
      .from(supportAccessGrants)
      .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
      .innerJoin(users, eq(users.id, accounts.ownerUserId))
      .where(and(eq(supportAccessGrants.status, "approved"), gt(supportAccessGrants.expiresAt, sql`now()`))),
    db
      .select({ day: sql<string>`to_char(${subscriptions.currentPeriodEnd} at time zone 'UTC', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int`, cancel: sql<number>`count(*) filter (where ${subscriptions.cancelAtPeriodEnd})::int` })
      .from(subscriptions)
      .where(and(eq(subscriptions.source, "stripe"), inArray(subscriptions.status, [...ENTITLING_STATUSES]), sql`${subscriptions.currentPeriodEnd} between now() and now() + interval '14 days'`))
      .groupBy(sql`1`),
  ]);
  const events: UpcomingEvent[] = [];
  if (schedule.scheduled) events.push({ at: schedule.scheduled.at, title: "Scheduled deploy to garwinai.com", detail: `Version ${schedule.scheduled.sha.slice(0, 7)}`, href: "/settings/general#deploy", kind: "deploy" });
  for (const v of views) events.push({ at: v.expiresAt!, title: `Remote view of ${v.name} ends`, href: `/admin/remote/${v.id}`, kind: "remote" });
  for (const r of renewals) {
    events.push({
      at: new Date(`${r.day}T12:00:00Z`),
      title: `${r.n - r.cancel} subscription${r.n - r.cancel === 1 ? "" : "s"} renew${r.n - r.cancel === 1 ? "s" : ""}`,
      detail: r.cancel ? `${r.cancel} set to cancel` : undefined,
      kind: "billing",
    });
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 6);
}
