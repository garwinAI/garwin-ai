"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireUser } from "@/lib/auth/session";
import { parseInput, uuidSchema } from "@/lib/validation";
import { decideRemoteView, endRemoteView } from "@/server/services/support-access";

const decideSchema = z.object({ grantId: uuidSchema, decision: z.enum(["accept", "deny"]) });

/** The user answers an Admin's remote view request. */
export async function decideRemoteViewAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("decideRemoteView", async () => {
    const user = await requireUser();
    const { grantId, decision } = parseInput(decideSchema, form);
    await decideRemoteView(user, grantId, decision === "accept", await requestMeta());
    revalidatePath("/", "layout");
    return { ok: decision === "accept" ? "Accepted. You can end it at any time." : "Denied." };
  });
}

/** Either side ends a remote view. */
export async function endRemoteViewAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("endRemoteView", async () => {
    const user = await requireUser();
    const { grantId } = parseInput(z.object({ grantId: uuidSchema }), form);
    await endRemoteView(user, grantId, await requestMeta());
    revalidatePath("/", "layout");
    return { ok: "Remote view ended." };
  });
}
