import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/components/ui/page-header";

/** Shown when a team member opens something the host hasn't given them access to. */
export function NoAccess({ title, what }: { title: string; what: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <EmptyState icon={Lock} title="You don't have access" body={`Your account host hasn't given you permission to ${what}. Ask them to update your permissions in Settings → Team.`} />
      </PageBody>
    </>
  );
}
