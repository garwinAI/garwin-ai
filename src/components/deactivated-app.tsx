import { PowerOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/ui/page-header";

/** Shown instead of an app's page when the account has deactivated it. */
export function DeactivatedApp({ name, canManage }: { name: string; canManage: boolean }) {
  return (
    <>
      <PageHeader title={name} />
      <PageBody>
        <EmptyState
          icon={PowerOff}
          title={`${name} is deactivated`}
          body={canManage ? `Activate ${name} in Settings → Apps to use it again.` : `Ask your account host to activate ${name}.`}
          action={canManage ? <ButtonLink href="/settings/apps">Manage apps</ButtonLink> : undefined}
        />
      </PageBody>
    </>
  );
}
