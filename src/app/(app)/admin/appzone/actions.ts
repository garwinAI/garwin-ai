"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { reviewDecisionSchema } from "@/lib/appzone";
import { parseInput, uuidSchema } from "@/lib/validation";
import { approveUpload, denyUpload, reviewDeveloper } from "@/server/services/appzone";

export async function reviewUploadAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("appzoneReview", async () => {
    const admin = await requireAdmin();
    const { versionId } = parseInput(z.object({ versionId: uuidSchema }), form);
    const { decision, note } = parseInput(reviewDecisionSchema, form);
    const meta = await requestMeta();
    if (decision === "approve") await approveUpload(admin, versionId, note, meta);
    else await denyUpload(admin, versionId, note, meta);
    revalidatePath("/admin/appzone", "layout");
    return { ok: decision === "approve" ? "Approved. The upload fee was charged and the developer was notified." : "Denied. No fee was charged; the developer was notified." };
  });
}

export async function reviewDeveloperAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("developerReview", async () => {
    const admin = await requireAdmin();
    const { profileId } = parseInput(z.object({ profileId: uuidSchema }), form);
    const { decision, note } = parseInput(reviewDecisionSchema, form);
    await reviewDeveloper(admin, profileId, decision, note, await requestMeta());
    revalidatePath("/admin/appzone", "layout");
    return { ok: decision === "approve" ? "Developer approved." : "Application denied." };
  });
}
