import "server-only";
import { count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { PlanId } from "@/lib/plans";

export async function getMemberStats() {
  const [[{ total }], [{ teamMembers }], [{ developers }], byPlan] = await Promise.all([
    db.select({ total: count() }).from(users),
    db.select({ teamMembers: count() }).from(users).where(isNotNull(users.hostId)),
    db.select({ developers: count() }).from(users).where(eq(users.developerStatus, "approved")),
    db.select({ plan: users.plan, n: count() }).from(users).groupBy(users.plan),
  ]);
  const perPlan = Object.fromEntries(byPlan.map((r) => [r.plan, r.n])) as Partial<Record<PlanId, number>>;
  return { total, teamMembers, developers, perPlan };
}
