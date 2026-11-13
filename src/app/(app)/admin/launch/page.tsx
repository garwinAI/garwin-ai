import type { Metadata } from "next";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";
import { getLaunchChecklist } from "@/server/services/launch";
import { StepToggle } from "./step-toggle";

export const metadata: Metadata = { title: "Launch checklist · Admin" };

export default async function LaunchChecklistPage() {
  const admin = await requireAdmin();
  const items = await getLaunchChecklist(admin);
  const done = items.filter((i) => i.done).length;
  const sections = [...new Set(items.map((i) => i.section))];

  return (
    <>
      <PageHeader
        title="Launch checklist"
        description={`${done} of ${items.length} done. Green steps marked “Automatic” are detected from this site's settings; tick the others yourself.`}
        actions={
          <ButtonLink href="/admin" variant="secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin
          </ButtonLink>
        }
      />
      <PageBody>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
          role="progressbar"
          aria-label="Launch progress"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
        </div>
        <p className="text-sm text-neutral-500">
          The dev and live sites keep separate checklists, because each has its own settings and database.
        </p>
        {sections.map((section) => (
          <CardSection key={section} id={section.toLowerCase().replace(/[^a-z]+/g, "-")} title={section}>
            <ul className="divide-y divide-neutral-100">
              {items
                .filter((i) => i.section === section)
                .map((item) => (
                  <li key={item.key} data-testid={`launch-${item.key}`} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      {item.done ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-neutral-300" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">
                          {item.title} <span className="sr-only">{item.done ? "(done)" : "(not done)"}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-600">{item.how}</p>
                        {item.completedAt && (
                          <p className="mt-1 text-xs text-neutral-500">
                            Marked done <LocalTime iso={item.completedAt.toISOString()} />
                          </p>
                        )}
                      </div>
                    </div>
                    {item.auto ? (
                      <Badge tone={item.done ? "success" : "neutral"}>{item.done ? "Automatic: done" : "Automatic"}</Badge>
                    ) : (
                      <StepToggle stepKey={item.key} done={item.done} title={item.title} />
                    )}
                  </li>
                ))}
            </ul>
          </CardSection>
        ))}
      </PageBody>
    </>
  );
}
