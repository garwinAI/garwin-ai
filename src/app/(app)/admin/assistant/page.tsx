import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { PROTECTED_SUMMARY } from "@/lib/site-editor";
import { getSiteEditorStatus } from "@/server/services/site-editor";
import { ButtonLink } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { EditorChat } from "./editor-chat";

export const metadata: Metadata = { title: "Admin Assistant" };

// A request can involve many AI steps. Applies to this page's server actions on Vercel.
export const maxDuration = 300;

export default async function AdminAssistantPage() {
  await requireAdmin();
  const status = getSiteEditorStatus();

  return (
    <>
      <PageHeader
        title="Admin Assistant"
        description="Describe a change to the website. The Assistant edits the code and saves it to the dev site."
        actions={
          <>
            <ButtonLink href="/admin/assistant/log" variant="secondary" size="sm">View chat log</ButtonLink>
            <ButtonLink href="/admin" variant="secondary" size="sm">Back to Admin</ButtonLink>
          </>
        }
      />
      <PageBody>
        <details className="card px-4 py-3 text-sm text-neutral-700">
          <summary className="cursor-pointer font-medium text-neutral-900">How this works</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Each request that changes something is saved as one commit on the dev branch. The dev site rebuilds a few minutes later.</li>
            <li>The live site never changes from here. Check the dev site, then press Update App on the Admin page.</li>
            <li>The Assistant can&apos;t run or test the code, so review its changes on the dev site before publishing.</li>
            <li>It can&apos;t change: {PROTECTED_SUMMARY}. Those need a developer.</li>
            <li>This conversation isn&apos;t stored; it clears when you leave the page. Saved changes stay on dev.</li>
            {status.available && <li>Model: {status.model}. Anthropic bills usage to your API account.</li>}
          </ul>
        </details>
        <EditorChat status={status} />
      </PageBody>
    </>
  );
}
