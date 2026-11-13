import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getMemberStats } from "@/server/services/admin-stats";
import { PLAN_ORDER, PLAN_SPEC } from "@/lib/plans";
import { computeHealth, HEALTH_STYLES } from "@/lib/health";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { pingDatabase } from "@/db";
import { DEV_BRANCH, LIVE_BRANCH, shortSha, updateBlockedReason } from "@/lib/app-update";
import { checkForUpdate } from "@/server/services/app-update";
import { UpdateAppButton } from "./update-app";

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

  const { total, teamMembers, developers, perPlan: planCount } = await getMemberStats();
  const config = env();
  const update = await checkForUpdate();
  const available = update.state === "update_available" ? update : null;

  const health = computeHealth({
    online: await pingDatabase(),
    critical: false,
    significantIssue: false,
    paymentsConfigured: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET),
    assistantConfigured: Boolean(config.ASSISTANT_API_KEY),
    oldestOpenTicketHours: null, // support tickets arrive in Phase 6
  });
  const style = HEALTH_STYLES[health.level];

  return (
    <>
      <PageHeader title="Admin" description="Run Garwin AI: members, plans, marketplace, support and system health." />
      <PageBody>
        <section className={`flex flex-wrap items-start justify-between gap-4 rounded-xl border p-5 ${style.badge}`}>
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <span className={`h-3 w-3 rounded-full ${style.dot}`} aria-hidden="true" /> System health: {style.label}
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

        <section id="app-update" aria-labelledby="app-update-title" className="card scroll-mt-20 p-5">
          <h2 id="app-update-title" className="font-semibold">App update</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Copies what is on the <code>{DEV_BRANCH}</code> branch (the dev site) to the <code>{LIVE_BRANCH}</code> branch (the live site).
            {available && ` ${available.count} change${available.count === 1 ? "" : "s"} waiting, version ${shortSha(available.devSha)}.`}
          </p>
          {available && available.changes.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-0.5 text-sm text-neutral-700">
              {available.changes.map((c) => <li key={c.sha} className="break-words">{c.summary}</li>)}
              {available.count > available.changes.length && <li className="list-none text-neutral-500">and {available.count - available.changes.length} more</li>}
            </ul>
          )}
          <div className="mt-4">
            <UpdateAppButton devSha={available?.devSha ?? null} blockedReason={updateBlockedReason(update)} />
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Members", value: total },
            { label: "Team members", value: teamMembers },
            { label: "Approved developers", value: developers },
          ].map((s) => (
            <Card key={s.label} className="p-5">
              <p className="text-sm text-neutral-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </Card>
          ))}
        </div>

        <section className="card p-5">
          <h2 className="font-semibold">Members by plan</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PLAN_ORDER.map((id) => (
              <div key={id} className="rounded-lg bg-neutral-50 p-3">
                <p className="text-xs text-neutral-500">{PLAN_SPEC[id].name}</p>
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
                {t.name} <PlannedBadge phase={t.phase} />
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}
