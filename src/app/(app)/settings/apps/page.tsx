import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS, appIncludedInPlan } from "@/lib/apps";
import { Section } from "../section";

export const metadata: Metadata = { title: "App settings" };

export default async function AppsSettings() {
  const user = await requireUser();
  const apps = BUILT_IN_APPS.filter((a) => appIncludedInPlan(a, user.plan));
  return (
    <Section title="Your apps" description="Settings for each app. Apps added from AppZone can be deactivated here.">
      <ul className="divide-y divide-neutral-100">
        {apps.map((app) => (
          <li key={app.slug} className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <span className={`h-9 w-9 rounded-lg bg-gradient-to-br ${app.color}`} />
              <div>
                <p className="text-sm font-medium">{app.name}</p>
                <p className="text-xs text-neutral-500">Included with your plan</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary px-3 py-1.5" disabled title="App settings arrive with each app">Settings</button>
              <button className="btn-secondary px-3 py-1.5" disabled title="Built-in apps can't be deactivated">Deactivate</button>
              {app.href ? (
                <Link href={app.href} className="btn-primary px-3 py-1.5">Go</Link>
              ) : (
                <button className="btn-primary px-3 py-1.5" disabled>Go</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
