"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireUser } from "@/lib/auth/session";
import { parseInput, uuidSchema } from "@/lib/validation";
import { openTicket, replyAsUser } from "@/server/services/support";
import { answerTicket, autopilotConfigured, getAutopilot } from "@/server/services/autopilot";

/** If Auto Pilot is on, answer right after the response is sent (the page refreshes to show it). */
async function autopilotAfter(ticketId: string) {
  if (autopilotConfigured() && (await getAutopilot()).on) after(() => answerTicket(ticketId).then(() => undefined));
}

const openSchema = z.object({
  subject: z.string().trim().min(1, "Give your question a subject.").max(200),
  body: z.string().trim().min(1, "Describe what you need.").max(5000),
});

export async function openTicketAction(_: FormState, form: FormData): Promise<FormState> {
  let id: string | undefined;
  const values = { subject: String(form.get("subject") ?? ""), body: String(form.get("body") ?? "") };
  const state = await runAction(
    "openSupportTicket",
    async () => {
      const user = await requireUser();
      const input = parseInput(openSchema, form);
      id = (await openTicket(user, input, await requestMeta())).id;
      await autopilotAfter(id);
    },
    values,
  );
  if (id) redirect(`/support/${id}`);
  return state;
}

const replySchema = z.object({ ticketId: uuidSchema, body: z.string().trim().min(1, "Write a message.").max(5000) });

export async function replyTicketAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("replySupportTicket", async () => {
    const user = await requireUser();
    const { ticketId, body } = parseInput(replySchema, form);
    await replyAsUser(user, ticketId, body, await requestMeta());
    await autopilotAfter(ticketId);
    revalidatePath(`/support/${ticketId}`);
    return { ok: "Sent." };
  });
}
