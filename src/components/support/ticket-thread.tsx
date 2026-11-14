import { Bot } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";

export type ThreadMessage = { id: string; body: string; createdAt: Date; senderId: string | null; senderName: string | null; senderRole: string | null };

/** A support conversation. `customerId` decides which side each message sits on. */
export function TicketThread({ messages, customerId }: { messages: ThreadMessage[]; customerId: string | null }) {
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m) => {
        const mine = m.senderId === customerId;
        const who = m.senderId === null ? "Garwin AI Support (Auto Pilot)" : mine ? (m.senderName ?? "Customer") : `${m.senderName ?? "Garwin AI"} (Garwin AI)`;
        return (
          <li key={m.id} data-testid="ticket-message" className={cn("max-w-[85%] rounded-xl px-4 py-3 text-sm", mine ? "ml-auto bg-brand-50" : "bg-neutral-100")}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              {m.senderId === null && <Bot className="h-3.5 w-3.5" aria-hidden="true" />}
              {who} · <LocalTime iso={m.createdAt.toISOString()} />
            </p>
            <p className="whitespace-pre-wrap break-words text-neutral-900">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export const STATUS_TEXT: Record<string, { label: string; tone: "brand" | "warning" | "success" | "neutral" }> = {
  open: { label: "Waiting for Garwin AI", tone: "brand" },
  pending: { label: "Waiting for you", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};
