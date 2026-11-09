import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { listInstalledApps } from "@/server/services/apps";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, Button } from "@/components/ui/button";
import { AppToggle } from "./app-toggle";

export const metadata: Metadata = { title: "App settings" };

export default async function AppsSettings() {
  const user = await requireUser();
  const ent = await getEntitlements(user);
  const apps = await listInstalledApps(user);

  return (
    <CardSection
      id="installed-apps"
      title="Installed apps"
      description={
        ent.canManageApps
          ? "Change each app's settings, deactivate apps you don't use, or open them. Deactivated apps are hidden for your whole team."
          : "Your account host manages which apps are active for the team."
      }
    >
      <ul className="divide-y divide-neutral-100" aria-label="Installed apps">
        {apps.map(({ app, active }) => {
          const noSettingsId = `${app.slug}-no-settings`;
          return (
            <li key={app.slug} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={`h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br ${app.color} ${active ? "" : "opacity-40 grayscale"}`} aria-hidden="true" />
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {app.name}
                    {active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {!app.canDeactivate ? "Always on" : app.href ? app.tagline : "Not built yet"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {app.settings ? (
                  <ButtonLink href={`/settings/apps/${app.slug}`} variant="secondary" size="sm" aria-label={`${app.name} settings`}>
                    Settings
                  </ButtonLink>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" disabled aria-describedby={noSettingsId}>Settings</Button>
                    <span id={noSettingsId} className="sr-only">{app.name} has no settings yet</span>
                  </>
                )}

                {app.canDeactivate && (
                  <AppToggle slug={app.slug} appName={app.name} active={active} disabled={!ent.canManageApps} />
                )}

                {active && app.href ? (
                  <ButtonLink href={app.href} size="sm" aria-label={`Open ${app.name}`}>Open</ButtonLink>
                ) : (
                  <Button size="sm" disabled aria-label={`Open ${app.name} (${active ? "not built yet" : "deactivated"})`}>Open</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-neutral-500">
        Looking for more? <Link href="/appzone" className="font-medium text-brand-600 hover:underline">Browse AppZone</Link>.
      </p>
    </CardSection>
  );
}
