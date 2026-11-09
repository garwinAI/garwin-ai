import type { Metadata } from "next";
import { Code2, LayoutGrid, Palette, PanelsTopLeft, Store } from "lucide-react";
import { ComingSoon, EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "AppZone" };

const CATEGORIES = [
  { icon: LayoutGrid, label: "Apps & plugins" },
  { icon: PanelsTopLeft, label: "Widgets" },
  { icon: Palette, label: "Themes" },
];

export default async function AppZonePage() {
  const user = await requireUser();
  const limit = PLANS[user.plan].appZoneDownloads;

  return (
    <>
      <PageHeader
        title="AppZone"
        description="Apps, widgets and themes for your workspace, from Garwin AI and approved developers."
        actions={<ComingSoon phase={5} />}
      />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {CATEGORIES.map(({ icon: Icon, label }, i) => (
              <span
                key={label}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
                  i === 0 ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </span>
            ))}
          </div>
          <p className="text-sm text-neutral-500">
            Free downloads used:{" "}
            <span className="font-medium text-neutral-900">{limit === null ? "Unlimited" : `0 of ${limit}`}</span>
          </p>
        </div>
        <EmptyState
          icon={Store}
          title="The marketplace is being stocked"
          body="Developers can apply, get approved by Admin and publish apps, widgets and themes here."
        />
        <div className="card flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 text-accent-500" />
            <div>
              <p className="font-medium">Build for AppZone</p>
              <p className="text-sm text-neutral-500">Apply to become a developer and sell your apps, widgets and themes.</p>
            </div>
          </div>
          <button className="btn-secondary" disabled>Apply · Phase 5</button>
        </div>
      </div>
    </>
  );
}
