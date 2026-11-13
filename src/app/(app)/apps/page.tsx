import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Store } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { listInstalledApps } from "@/server/services/apps";
import { ADMIN_APPS, BUILT_IN_APPS } from "@/lib/apps";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Apps" };

export default async function AppsPage() {
  const user = await requireUser();
  const [{ plan }, installed] = await Promise.all([getEntitlements(user), listInstalledApps(user)]);
  const bySlug = new Map(installed.map((i) => [i.app.slug, i]));

  return (
    <>
      <PageHeader
        title="Apps"
        description="Apps included with your plan, plus anything you add from AppZone."
        actions={
          <ButtonLink href="/appzone">
            <Store className="h-4 w-4" aria-hidden="true" /> Go to AppZone
          </ButtonLink>
        }
      />
      <PageBody>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Apps">
          {BUILT_IN_APPS.map((app) => {
            const inst = bySlug.get(app.slug);
            const status = !inst ? "locked" : !inst.active ? "deactivated" : app.href ? "ready" : "unbuilt";
            return (
              <li key={app.slug}>
                <Link href={`/apps/${app.slug}`} className="card group block h-full overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600">
                  <div className={cn("h-24 bg-gradient-to-br", app.color, status !== "ready" && "opacity-50 grayscale")} aria-hidden="true" />
                  <div className="p-4">
                    <p className="flex items-center justify-between gap-2 font-medium">
                      {app.name}
                      {status === "locked" && (
                        <Badge tone="accent"><Lock className="h-3 w-3" aria-hidden="true" /> Starter+</Badge>
                      )}
                      {status === "deactivated" && <Badge>Deactivated</Badge>}
                      {status === "unbuilt" && <Badge>Coming soon</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500">{app.tagline}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-neutral-500">You&apos;re on the {plan.name} plan.</p>
        {user.role === "admin" && (
          <section aria-labelledby="admin-apps-title" className="space-y-3">
            <h2 id="admin-apps-title" className="font-semibold">Admin apps</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Admin apps">
              {ADMIN_APPS.map((app) => (
                <li key={app.slug}>
                  <Link href={app.href} className="card group block h-full overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600">
                    <div className={cn("flex h-24 items-end bg-gradient-to-br p-3 font-mono text-xs text-green-400", app.color)} aria-hidden="true">
                      $ tail -f garwin.log_
                    </div>
                    <div className="p-4">
                      <p className="flex items-center justify-between gap-2 font-medium">
                        {app.name} <Badge>Admins only</Badge>
                      </p>
                      <p className="mt-0.5 text-sm text-neutral-500">{app.tagline}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageBody>
    </>
  );
}
