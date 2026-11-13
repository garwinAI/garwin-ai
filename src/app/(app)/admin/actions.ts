"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { shaSchema } from "@/lib/app-update";
import { parseInput } from "@/lib/validation";
import { publishUpdate, removeScheduledDeploy, scheduleUpdate } from "@/server/services/app-update";

const updateSchema = z.object({ sha: shaSchema });

export async function updateAppAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("updateApp", async () => {
    const admin = await requireAdmin();
    const { sha } = parseInput(updateSchema, form);
    await publishUpdate(admin, sha, await requestMeta());
    revalidatePath("/", "layout");
    return { ok: "Update sent to the live site. It will be live in a few minutes, when the build finishes." };
  });
}

const scheduleSchema = z.object({
  sha: shaSchema,
  // The browser converts the Admin's local date and time to an ISO timestamp before submitting.
  at: z.iso.datetime({ message: "Choose a date and time." }),
});

export async function scheduleUpdateAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("scheduleUpdate", async () => {
    const admin = await requireAdmin();
    const { sha, at } = parseInput(scheduleSchema, form);
    await scheduleUpdate(admin, sha, new Date(at), await requestMeta());
    revalidatePath("/", "layout");
    return { ok: "Scheduled. The update goes live within about 15 minutes of the time you picked." };
  });
}

const removeSchema = z.object({ ref: z.string().regex(/^refs\/tags\/deploy-(schedule|failed)\/\d{9,11}$/, "Reload the page and try again.") });

export async function removeScheduleAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("removeScheduledUpdate", async () => {
    const admin = await requireAdmin();
    const { ref } = parseInput(removeSchema, form);
    const kind = await removeScheduledDeploy(admin, ref, await requestMeta());
    revalidatePath("/", "layout");
    return { ok: kind === "scheduled" ? "Schedule canceled." : "Dismissed." };
  });
}
