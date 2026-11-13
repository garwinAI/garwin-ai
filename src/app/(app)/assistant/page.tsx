import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getAssistantStatus } from "@/server/services/assistant";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const user = await requireUser();
  const status = await getAssistantStatus();
  return (
    // Fills the viewport below the mobile top bar (3.5rem) or the full height on desktop.
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <header className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-8">
        <h1 className="text-lg font-semibold">Assistant</h1>
      </header>
      <div className="min-h-0 flex-1">
        <AssistantChat userName={user.name} status={status} />
      </div>
    </div>
  );
}
