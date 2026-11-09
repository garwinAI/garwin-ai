import type { Metadata } from "next";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { computeHealth, HEALTH_STYLES } from "@/lib/health";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Admin" };

const UPCOMING = [
  { name: "Members", phase: 6 },
  { name: "Plans & prices", phase: 2 },
  { name: "Stripe settings", phase: 2 },
  { name: "Apps & marketplace", phase: 5 },
  { name: "Developer applications", phase: 5 },
  { name: "Support tickets", phase: 6 },
  { name: "Assistant API", phase: 7 },
  { name: "Analytics", phase: 6 },
];

export default async function AdminPage() {
  await requireAdmin();

  const [{ total }] = await db.select({ total: count() }).from(users);
  const [{ teamMembers }] = await db.select({ teamMembers: count() }).from(users).where(sql`${users.hostId} is not null`);
  const [{ developers }] = await db.select({ developers: count() }).from(users).where(eq(users.developerStatus, "approved"));
  const byPlan = await db.select({ plan: users.plan, n: count() }).from(users).groupBy(users.plan);
  const planCount = Object.fromEntries(byPlan.map((r) => [r.plan, r.n]));

  const health = computeHealth({
    online: true,
    critical: false,
    significantIssue: false,
    paymentsConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    assistantConfigured: Boolean(process.env.ASSISTANT_API_KEY),
    oldestOpenTicketHours: null, // support tickets arrive in Phase 6
  });
  const style = HEALTH_STYLES[health.level];

  return (
    <>
      <PageHeader title="Admin" description="Run Garwin AI: members, plans, marketplace, support and system health." />
      <div className="space-y-6 p-8">
        <section className={`flex flex-wrap items-start justify-between gap-4 rounded-xl border p-5 ${style.badge}`}>
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <span className={`h-3 w-3 rounded-full ${style.dot}`} /> System health: {style.label}
            </p>
            {health.reasons.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-sm">
                {health.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm">All systems normal.</p>
            )}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Members", value: total },
            { label: "Team members", value: teamMembers },
            { label: "Approved developers", value: developers },
          ].map((s) => (
            <div key={s.label} className="card p-5">
              <p className="text-sm text-neutral-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        <section className="card p-5">
          <h2 className="font-semibold">Members by plan</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PLAN_ORDER.map((id) => (
              <div key={id} className="rounded-lg bg-neutral-50 p-3">
                <p className="text-xs text-neutral-500">{PLANS[id].name}</p>
                <p className="text-lg font-semibold">{planCount[id] ?? 0}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Admin tools</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {UPCOMING.map((t) => (
              <li key={t.name} className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2.5 text-sm">
                {t.name} <ComingSoon phase={t.phase} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
