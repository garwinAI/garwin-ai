"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { parseInput, uuidSchema } from "@/lib/validation";
import { replyAsAdmin, setTicketStatus } from "@/server/services/support";
import { escalateTicket, setAutopilot } from "@/server/services/autopilot";

const replySchema = z.object({
  ticketId: uuidSchema,
  body: z.string().trim().min(1, "Write a reply.").max(5000),
  then: z.enum(["wait", "resolve"]),
});

export async function adminReplyAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("adminReplyTicket", async () => {
    const admin = await requireAdmin();
    const { ticketId, body, then } = parseInput(replySchema, form);
    await replyAsAdmin(admin, ticketId, body, then, await requestMeta());
    revalidatePath("/admin", "layout");
    return { ok: then === "resolve" ? "Sent and resolved." : "Sent. Waiting for their reply." };
  });
}

const statusSchema = z.object({ ticketId: uuidSchema, op: z.enum(["close", "reopen", "escalate"]) });

export async function ticketStatusAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("ticketStatus", async () => {
    const admin = await requireAdmin();
    const { ticketId, op } = parseInput(statusSchema, form);
    const meta = await requestMeta();
    if (op === "escalate") await escalateTicket(admin, ticketId, meta);
    else await setTicketStatus(admin, ticketId, op === "close" ? "closed" : "open", meta);
    revalidatePath("/admin", "layout");
    return { ok: op === "close" ? "Ticket closed." : op === "reopen" ? "Ticket reopened." : "Escalated. Auto Pilot will leave it alone." };
  });
}

export async function autopilotAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("setAutopilot", async () => {
    const admin = await requireAdmin();
    const { state } = parseInput(z.object({ state: z.enum(["on", "off"]) }), form);
    await setAutopilot(admin, state === "on", await requestMeta());
    revalidatePath("/admin", "layout");
    return { ok: state === "on" ? "Auto Pilot is on." : "Auto Pilot is off." };
  });
}
