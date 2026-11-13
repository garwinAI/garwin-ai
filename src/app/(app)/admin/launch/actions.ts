"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { parseInput } from "@/lib/validation";
import { setLaunchStep } from "@/server/services/launch";

const schema = z.object({ key: z.string().regex(/^[a-z_]{1,40}$/), done: z.enum(["true", "false"]) });

export async function toggleLaunchStepAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("toggleLaunchStep", async () => {
    const admin = await requireAdmin();
    const { key, done } = parseInput(schema, form);
    await setLaunchStep(admin, key, done === "true", await requestMeta());
    revalidatePath("/admin/launch");
    revalidatePath("/admin");
  });
}
