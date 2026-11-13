"use server";

import { revalidatePath } from "next/cache";
import { runAction, type FormState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { markAllRead } from "@/server/services/notifications";

export async function markAllReadAction(_: FormState): Promise<FormState> {
  return runAction("markAllRead", async () => {
    const user = await requireUser();
    await markAllRead(user.id);
    revalidatePath("/", "layout");
  });
}
