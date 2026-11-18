import type { Metadata } from "next";
import Link from "next/link";
import { Code2, Store } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS } from "@/lib/apps";
import { BUILT_IN_THEMES } from "@/lib/app-icons";
import { BUILT_IN_WIDGETS } from "@/lib/workspace";
import { itemTypeLabel } from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { getEntitlements } from "@/server/services/entitlements";
import { getDeveloperProfile, listPublishedItems } from "@/server/services/appzone";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AppIcon, ThemeIcon, WidgetIcon } from "@/components/app-icon";
import { ItemIcon } from "@/components/appzone/item-icon";

export const metadata: Metadata = { title: "AppZone" };

type Listed = Awaited<ReturnType<typeof listPublishedItems>>[number];

function price(i: Listed) {
  return i.priceCents === 0 ? "Free" : `${formatPrice(i.priceCents, i.currency)}/mo · ${formatPrice(i.yearlyPriceCents, i.currency)}/yr`;
}

function Row({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h2 id={`${id}-title`} className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ItemGrid({ items }: { items: Listed[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/appzone/${i.slug}`} className="card flex h-full items-center gap-3 p-4 hover:shadow-md">
            <ItemIcon kind={i.kind} name={i.name} mainColor={i.mainColor} iconFileId={i.iconFileId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{i.name}</span>
              <span className="block truncate text-sm text-neutral-500">{i.summary}</span>
              <span className="mt-1 block text-xs text-neutral-500">{itemTypeLabel(i.kind, i.appType)} · {price(i)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function AppZonePage() {
  const user = await requireUser();
  const [{ plan }, items, dev] = await Promise.all([getEntitlements(user), listPublishedItems(), getDeveloperProfile(user.id)]);
  const allowance =
    plan.freeAppzoneDownloadLimit === null
      ? `Unlimited eligible downloads on ${plan.name}`
      : `${plan.freeAppzoneDownloadLimit} free downloads on ${plan.name} (lifetime)`;
  const apps = items.filter((i) => i.kind === "app");
  const widgets = items.filter((i) => i.kind === "widget");
  const themes = items.filter((i) => i.kind === "theme");
  const included = BUILT_IN_APPS.filter((a) => plan.includedApps.includes(a.slug));

  return (
    <>
      <PageHeader
        title="AppZone"
        description="Apps, tools, widgets and page themes for your workspace. Anything beyond the base apps is subscribed to here."
        actions={
          <ButtonLink href="/appzone/developer" variant="secondary">
            <Code2 className="h-4 w-4" aria-hidden="true" /> {dev?.status === "approved" ? "My uploads" : "Build for AppZone"}
          </ButtonLink>
        }
      />
      <PageBody>
        <p className="text-sm text-neutral-500">{allowance}</p>

        <Row title="Apps and tools" id="apps">
          {apps.length > 0 ? <ItemGrid items={apps} /> : <EmptyState icon={Store} title="No apps listed yet" body="Approved developers' apps and tools show up here." />}
        </Row>

        <Row title="Widgets" id="widgets">
          <ul className="flex flex-wrap gap-3" aria-label="Included widgets">
            {BUILT_IN_WIDGETS.map((w) => (
              <li key={w.type} className="card flex items-center gap-2 py-2 pl-2 pr-3 text-sm">
                <WidgetIcon name={w.name} size="sm" /> {w.name} <Badge>Included</Badge>
              </li>
            ))}
          </ul>
          {widgets.length > 0 && <ItemGrid items={widgets} />}
        </Row>

        <Row title="Page themes" id="themes">
          <ul className="flex flex-wrap gap-3" aria-label="Included themes">
            {BUILT_IN_THEMES.map((t) => (
              <li key={t.slug} className="card flex items-center gap-2 py-2 pl-2 pr-3 text-sm">
                <ThemeIcon accent={t.accent} size="sm" /> {t.name} <Badge>Included</Badge>
              </li>
            ))}
          </ul>
          {themes.length > 0 && <ItemGrid items={themes} />}
        </Row>

        <Row title={`Included with ${plan.name}`} id="included">
          <ul className="flex flex-wrap gap-4">
            {included.map((a) => (
              <li key={a.slug}>
                <Link href={`/apps/${a.slug}`} className="flex w-16 flex-col items-center gap-1 text-center text-xs">
                  <AppIcon spec={a.icon} size="md" /> {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </Row>

        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 shrink-0 text-accent-500" aria-hidden="true" />
            <div>
              <p className="font-medium">Build for AppZone</p>
              <p className="text-sm text-neutral-500">Apply as a developer, upload, and Admin reviews it. Fees are only charged when approved.</p>
            </div>
          </div>
          <ButtonLink href="/appzone/developer">{dev?.status === "approved" ? "My uploads" : "Get started"}</ButtonLink>
        </Card>
      </PageBody>
    </>
  );
}
