import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const user = await requireUser();
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white px-8 py-4">
        <h1 className="text-lg font-semibold">Assistant</h1>
      </header>
      <div className="min-h-0 flex-1">
        <AssistantChat userName={user.name} />
      </div>
    </div>
  );
}
