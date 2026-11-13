"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { GENERIC_ERROR, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { editRequestSchema, type EditResult } from "@/lib/site-editor";
import { runSiteEdit } from "@/server/services/site-editor";

const log = logger.child({ module: "site-editor" });

export type EditActionResult = { ok: true; result: EditResult } | { ok: false; error: string };

export async function editSiteAction(input: unknown): Promise<EditActionResult> {
  try {
    const admin = await requireAdmin();
    const parsed = editRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your message and try again." };
    const result = await runSiteEdit(admin, parsed.data, await requestMeta());
    // A new dev commit changes the "App update" status and notification count.
    if (result.commit) revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (err) {
    unstable_rethrow(err);
    if (isAppError(err)) return { ok: false, error: err.publicMessage };
    log.error("site_editor.failed", { err });
    return { ok: false, error: GENERIC_ERROR };
  }
}
