"use server";

import { runAction, type FormState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { saveWorkspaceLayout } from "@/server/services/workspace";

/** Saves the whole layout (validated on the server against layoutSchema). */
export async function saveLayoutAction(json: string): Promise<FormState> {
  return runAction("workspaceSave", async () => {
    const user = await requireUser();
    if (typeof json !== "string" || json.length > 200_000) throw new AppError("VALIDATION", "That layout is too large to save.");
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new AppError("VALIDATION", "That layout couldn't be saved. Reload and try again.");
    }
    await saveWorkspaceLayout(user, data);
    return { ok: "Saved" };
  });
}
