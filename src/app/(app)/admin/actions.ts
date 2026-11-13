"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { shaSchema } from "@/lib/app-update";
import { parseInput } from "@/lib/validation";
import { publishUpdate } from "@/server/services/app-update";

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
