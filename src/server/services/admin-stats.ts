import "server-only";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountMembers, accounts, developerProfiles, subscriptions, users } from "@/db/schema";
import { ENTITLING_STATUSES } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";

export async function getMemberStats() {
  const [[{ total }], [{ teamMembers }], [{ developers }], byPlan] = await Promise.all([
    db.select({ total: count() }).from(users),
    db.select({ teamMembers: count() }).from(accountMembers).where(eq(accountMembers.role, "member")),
    db.select({ developers: count() }).from(developerProfiles).where(eq(developerProfiles.status, "approved")),
    // Accounts per plan: an account without an entitling subscription is on Free.
    db
      .select({ plan: sql<string>`coalesce(${subscriptions.planId}, 'free')`, n: count() })
      .from(accounts)
      .leftJoin(subscriptions, and(eq(subscriptions.accountId, accounts.id), inArray(subscriptions.status, [...ENTITLING_STATUSES])))
      .groupBy(sql`coalesce(${subscriptions.planId}, 'free')`),
  ]);
  const perPlan = Object.fromEntries(byPlan.map((r) => [r.plan, r.n])) as Partial<Record<PlanId, number>>;
  return { total, teamMembers, developers, perPlan };
}
