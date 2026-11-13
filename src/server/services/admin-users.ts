// Admin views of members and AppZone items: lists, statistics, status changes and edits.
// Every function checks that the caller is a platform Admin.
import "server-only";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { ENTITLING_STATUSES } from "@/lib/entitlements";
import { likePattern, type ItemListQuery, type UserListQuery } from "@/lib/admin-dashboard";
import { canSignIn, type UserStatus } from "@/lib/user-status";
import { recordAudit } from "./audit";
import { revokeAllSessions } from "./sessions";
import type { RequestMeta } from "./security-events";

type Admin = { id: string; role: string };

export function assertAdmin(user: Admin) {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can do that.");
}

const ENTITLING = sql.raw(ENTITLING_STATUSES.map((s) => `'${s}'`).join(", "));

/** One row per user with their own workspace's plan and team facts. */
const USER_ROWS = sql`
  select u.id, u.name, u.email, u.role, u.status, u.created_at as "createdAt", a.id as "accountId",
    coalesce((select s.plan_id from subscriptions s where s.account_id = a.id and s.status in (${ENTITLING}) limit 1), 'free') as plan,
    (select count(*)::int from account_members m where m.account_id = a.id and m.role = 'member') as "teamSize",
    exists (select 1 from account_members m where m.user_id = u.id and m.role = 'member') as "isTeamMember"
  from users u
  left join accounts a on a.owner_user_id = u.id`;

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "member" | "admin";
  status: UserStatus;
  createdAt: Date;
  accountId: string | null;
  plan: string;
  teamSize: number;
  isTeamMember: boolean;
};

export const PAGE_SIZE = 25;

export async function listUsers(admin: Admin, query: UserListQuery) {
  assertAdmin(admin);
  const where: SQL[] = [];
  if (query.q) where.push(sql`(r.name ilike ${likePattern(query.q)} or r.email ilike ${likePattern(query.q)})`);
  switch (query.filter) {
    case "all":
      where.push(sql`r.status <> 'deleted'`);
      break;
    case "free":
      where.push(sql`r.plan = 'free' and r.status <> 'deleted'`);
      break;
    case "paid":
      where.push(sql`r.plan <> 'free' and r.status <> 'deleted'`);
      break;
    case "pro":
      where.push(sql`r.plan = 'pro' and r.status <> 'deleted'`);
      break;
    case "team_members":
      where.push(sql`r."isTeamMember" and r.status <> 'deleted'`);
      break;
    case "hosts":
      where.push(sql`r."teamSize" > 0 and r.status <> 'deleted'`);
      break;
    case "admins":
      where.push(sql`r.role = 'admin'`);
      break;
    case "attention":
      where.push(sql`r.status = 'needs_attention'`);
      break;
    case "deleted":
      where.push(sql`r.status = 'deleted'`);
      break;
  }
  const order =
    query.sort === "az" ? sql`lower(r.name) asc, r.email asc` : query.sort === "za" ? sql`lower(r.name) desc, r.email desc` : sql`r."createdAt" desc`;
  const filter = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;
  const offset = (query.page - 1) * PAGE_SIZE;
  const [rows, total] = await Promise.all([
    db.execute<AdminUserRow>(sql`select * from (${USER_ROWS}) r ${filter} order by ${order} limit ${PAGE_SIZE} offset ${offset}`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from (${USER_ROWS}) r ${filter}`),
  ]);
  return { rows: rows.rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })), total: total.rows[0].n, pageSize: PAGE_SIZE };
}

/** Total / paid / free users (deleted users excluded). A user's plan is their own workspace's. */
export async function userStats(admin: Admin) {
  assertAdmin(admin);
  const res = await db.execute<{ total: number; paid: number }>(sql`
    select count(*)::int as total, count(*) filter (where r.plan <> 'free')::int as paid
    from (${USER_ROWS}) r where r.status <> 'deleted'`);
  const { total, paid } = res.rows[0];
  return { total, paid, free: total - paid };
}

export async function getAdminUser(admin: Admin, id: string) {
  assertAdmin(admin);
  const res = await db.execute<AdminUserRow & { adminNote: string | null; emailVerifiedAt: Date | null; statusChangedAt: Date | null }>(sql`
    select r.*, u.admin_note as "adminNote", u.email_verified_at as "emailVerifiedAt", u.status_changed_at as "statusChangedAt"
    from (${USER_ROWS}) r join users u on u.id = r.id where r.id = ${id}`);
  const row = res.rows[0];
  if (!row) throw new AppError("NOT_FOUND", "That user doesn't exist.");
  return { ...row, createdAt: new Date(row.createdAt) };
}

async function loadTarget(id: string) {
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) throw new AppError("NOT_FOUND", "That user doesn't exist.");
  return target;
}

/** Changes a user's status. Blocking statuses end all of their sessions immediately. */
export async function setUserStatus(admin: Admin, id: string, status: UserStatus, meta?: RequestMeta) {
  assertAdmin(admin);
  if (id === admin.id) throw new AppError("CONFLICT", "You can't change your own status.");
  const target = await loadTarget(id);
  if (target.status === status) return;
  await db.update(users).set({ status, statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
  if (!canSignIn(status)) await revokeAllSessions(id);
  await recordAudit({
    accountId: null,
    actorUserId: admin.id,
    actorType: "admin",
    action: status === "deleted" ? "user.deleted" : status === "active" && target.status === "deleted" ? "user.restored" : "user.status_changed",
    targetType: "user",
    targetId: id,
    metadata: { from: target.status, to: status, name: target.name },
    meta,
  });
}

/** Edits name, email, role and the private Admin note. */
export async function updateUser(
  admin: Admin,
  id: string,
  input: { name: string; email: string; role: "member" | "admin"; adminNote: string | null },
  meta?: RequestMeta,
) {
  assertAdmin(admin);
  const target = await loadTarget(id);
  if (id === admin.id && input.role !== "admin") throw new AppError("CONFLICT", "You can't remove your own Admin role.");
  if (input.email !== target.email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, input.email), ne(users.id, id)));
    if (taken) throw new AppError("CONFLICT", "Another account already uses that email.");
  }
  const changed = (["name", "email", "role", "adminNote"] as const).filter((k) => (target[k] ?? null) !== (input[k] ?? null));
  if (changed.length === 0) return;
  await db
    .update(users)
    .set({
      name: input.name,
      email: input.email,
      role: input.role,
      adminNote: input.adminNote,
      // A new email address must be verified again.
      ...(input.email !== target.email && { emailVerifiedAt: null }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));
  await recordAudit({
    accountId: null,
    actorUserId: admin.id,
    actorType: "admin",
    action: changed.includes("role") ? "user.role_changed" : changed.length === 1 && changed[0] === "adminNote" ? "user.note_set" : "user.updated",
    targetType: "user",
    targetId: id,
    // Field names only (and the role), never the note text or old email.
    metadata: { name: input.name, changed, role: input.role },
    meta,
  });
}

// ---------------------------------------------------------------- AppZone items

export const ITEM_PAGE_SIZE = 15;

export type AdminItemRow = { id: string; name: string; kind: string; status: string; priceCents: number; currency: string; acquisitions: number; developer: string };

export async function listAppzoneItemsForAdmin(admin: Admin, query: ItemListQuery) {
  assertAdmin(admin);
  const where: SQL[] = [query.itab === "free" ? sql`i.price_cents = 0` : sql`i.price_cents > 0`];
  if (query.ikind !== "all") where.push(sql`i.kind = ${query.ikind}`);
  const order =
    query.isort === "name"
      ? sql`lower(i.name) asc`
      : query.isort === "price_high"
        ? sql`i.price_cents desc, lower(i.name)`
        : query.isort === "price_low"
          ? sql`i.price_cents asc, lower(i.name)`
          : sql`acquisitions desc, lower(i.name)`;
  const filter = sql.join(where, sql` and `);
  const [res, total] = await Promise.all([
    db.execute<AdminItemRow>(sql`
    select i.id, i.name, i.kind, i.status, i.price_cents as "priceCents", i.currency,
      (select count(*)::int from appzone_acquisitions q where q.item_id = i.id) as acquisitions,
      d.display_name as developer
    from appzone_items i join developer_profiles d on d.id = i.developer_id
    where ${filter}
    order by ${order}
    limit ${ITEM_PAGE_SIZE} offset ${(query.ipage - 1) * ITEM_PAGE_SIZE}`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from appzone_items i where ${filter}`),
  ]);
  return { rows: res.rows, total: total.rows[0].n, pageSize: ITEM_PAGE_SIZE };
}
