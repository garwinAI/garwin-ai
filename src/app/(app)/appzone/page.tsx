import type { Metadata } from "next";
import { Code2, LayoutGrid, Palette, PanelsTopLeft, Store } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { PlannedBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "AppZone" };

const CATEGORIES = [
  { icon: LayoutGrid, label: "Apps & plugins" },
  { icon: PanelsTopLeft, label: "Widgets" },
  { icon: Palette, label: "Themes" },
];

export default async function AppZonePage() {
  const user = await requireUser();
  const { plan } = await getEntitlements(user);
  const allowance =
    plan.freeAppzoneDownloadLimit === null
      ? `Unlimited eligible downloads on ${plan.name}`
      : `${plan.freeAppzoneDownloadLimit} free downloads on ${plan.name} (lifetime)`;

  return (
    <>
      <PageHeader
        title="AppZone"
        description="Apps, widgets and themes for your workspace, from Garwin AI and approved developers."
        actions={<PlannedBadge phase={5} />}
      />
      <PageBody>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ul className="flex flex-wrap gap-2" aria-label="Categories">
            {CATEGORIES.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700">
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </li>
            ))}
          </ul>
          <p className="text-sm text-neutral-500">{allowance}</p>
        </div>
        <EmptyState
          icon={Store}
          title="No items listed yet"
          body="The marketplace opens once developers can apply, get approved by Admin, and publish."
        />
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 shrink-0 text-accent-500" aria-hidden="true" />
            <div>
              <p className="font-medium">Build for AppZone</p>
              <p className="text-sm text-neutral-500">Developer applications open in Phase 5.</p>
            </div>
          </div>
          <PlannedBadge phase={5} />
        </Card>
      </PageBody>
    </>
  );
}
