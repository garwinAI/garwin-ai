import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { listChatLog } from "@/server/services/assistant-log";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Admin Assistant chat log" };

export default async function AssistantLogPage() {
  const admin = await requireAdmin();
  const log = (await listChatLog(admin)).reverse();
  const repo = env().GITHUB_REPO;
  return (
    <>
      <PageHeader
        title="Admin Assistant chat log"
        description="Everything you've asked the Admin Assistant, and what it did."
        actions={<ButtonLink href="/admin/assistant" size="sm">Open Admin Assistant</ButtonLink>}
      />
      <PageBody>
        <CardSection id="chat-log" title="Your conversations">
          {log.length === 0 ? (
            <p className="text-sm text-neutral-500">No chats yet. Chats are saved from now on.</p>
          ) : (
            <ol className="space-y-3" aria-label="Chat log">
              {log.map((m) => (
                <li key={m.id} className={cn("max-w-[85%] rounded-xl px-4 py-3 text-sm", m.role === "user" ? "ml-auto bg-brand-50" : "bg-neutral-100")}>
                  <p className="mb-1 text-xs font-medium text-neutral-600">
                    {m.role === "user" ? "You" : "Admin Assistant"} · <LocalTime iso={m.createdAt.toISOString()} />
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.commitSha && (
                    <a href={`https://github.com/${repo}/commit/${m.commitSha}`} className="mt-1 inline-block text-xs text-brand-700 hover:underline" target="_blank" rel="noreferrer">
                      Saved to dev as commit {m.commitSha.slice(0, 7)}
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardSection>
      </PageBody>
    </>
  );
}
