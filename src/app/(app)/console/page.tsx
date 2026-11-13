import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";
import { consoleEvents, listRecordings } from "@/server/services/console";
import { runSystemChecks } from "@/server/services/system";
import { ConsoleApp } from "./console-app";

export const metadata: Metadata = { title: "Console" };
export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const admin = await requireAdmin();
  await runSystemChecks();
  const [lines, recordings] = await Promise.all([consoleEvents(admin, { limit: 200 }), listRecordings(admin)]);
  return (
    <>
      <PageHeader title="Console" description="Everything happening on Garwin AI, live. Admins only." />
      <PageBody>
        <ConsoleApp initialLines={lines} />
        <CardSection id="recordings" title="Your recordings" description="Also saved in Storage → Console recordings.">
          {recordings.length === 0 ? (
            <p className="text-sm text-neutral-500">Press Record, then Stop Recording, to save what the Console shows.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {recordings.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {r.fileName ?? "Recording"} · {r.lineCount} line{r.lineCount === 1 ? "" : "s"} · <LocalTime iso={r.startedAt.toISOString()} />
                  </span>
                  <a href={`/api/admin/console/recordings/${r.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    <Download className="h-4 w-4" aria-hidden="true" /> Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </PageBody>
    </>
  );
}
