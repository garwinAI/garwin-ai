"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { USER_STATUSES } from "@/lib/user-status";
import { emailSchema, nameSchema, parseInput, uuidSchema } from "@/lib/validation";
import { setUserStatus, updateUser } from "@/server/services/admin-users";
import { requestRemoteView } from "@/server/services/support-access";
import { STATUS_LABELS } from "@/lib/user-status";

const statusSchema = z.object({ userId: uuidSchema, status: z.enum(USER_STATUSES, "Choose a status.") });

export async function setUserStatusAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("setUserStatus", async () => {
    const admin = await requireAdmin();
    const { userId, status } = parseInput(statusSchema, form);
    await setUserStatus(admin, userId, status, await requestMeta());
    revalidatePath("/admin", "layout");
    return { ok: status === "deleted" ? "User deleted. They can't sign in; restore by setting them Active." : `Status set to ${STATUS_LABELS[status]}.` };
  });
}

const editSchema = z.object({
  userId: uuidSchema,
  name: nameSchema,
  email: emailSchema,
  role: z.enum(["member", "admin"]),
  adminNote: z.string().trim().max(2000, "Notes can be up to 2000 characters.").transform((v) => v || null),
});

export async function updateUserAction(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), adminNote: String(form.get("adminNote") ?? "") };
  return runAction(
    "updateUser",
    async () => {
      const admin = await requireAdmin();
      const { userId, ...input } = parseInput(editSchema, form);
      await updateUser(admin, userId, input, await requestMeta());
      revalidatePath("/admin", "layout");
      return { ok: "Saved." };
    },
    values,
  );
}

const remoteSchema = z.object({
  userId: uuidSchema,
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters.").max(1000),
});

export async function requestRemoteViewAction(_: FormState, form: FormData): Promise<FormState> {
  let grantId: string | undefined;
  const state = await runAction(
    "requestRemoteView",
    async () => {
      const admin = await requireAdmin();
      const { userId, reason } = parseInput(remoteSchema, form);
      grantId = (await requestRemoteView(admin, userId, reason, await requestMeta())).grant.id;
    },
    { reason: String(form.get("reason") ?? "") },
  );
  if (grantId) redirect(`/admin/remote/${grantId}`);
  return state;
}
