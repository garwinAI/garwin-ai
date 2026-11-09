import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS, appIncludedInPlan } from "@/lib/apps";

export const metadata: Metadata = { title: "Apps" };

export default async function AppsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="Apps"
        description="Apps included with your plan, plus anything you add from AppZone."
        actions={
          <Link href="/appzone" className="btn-primary">
            <Store className="h-4 w-4" /> Go to AppZone
          </Link>
        }
      />
      <div className="grid gap-4 p-8 sm:grid-cols-2 xl:grid-cols-4">
        {BUILT_IN_APPS.map((app) => {
          const included = appIncludedInPlan(app, user.plan);
          return (
            <Link key={app.slug} href={`/apps/${app.slug}`} className="card group overflow-hidden transition-shadow hover:shadow-md">
              <div className={`h-24 bg-gradient-to-br ${app.color} ${included ? "" : "opacity-50 grayscale"}`} />
              <div className="p-4">
                <p className="flex items-center justify-between font-medium">
                  {app.name}
                  {!included && (
                    <span className="flex items-center gap-1 text-xs font-medium text-accent-600">
                      <Lock className="h-3 w-3" /> Starter+
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-neutral-500">{app.tagline}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
