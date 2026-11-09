"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { parseInput } from "@/lib/validation";
import { saveAppSettings, setAppActive } from "@/server/services/apps";

const toggleSchema = z.object({
  slug: z.string().min(1).max(40),
  active: z.enum(["true", "false"]),
});

export async function toggleApp(_: FormState, form: FormData): Promise<FormState> {
  return runAction("toggleApp", async () => {
    const user = await requireUser();
    const { slug, active } = parseInput(toggleSchema, form);
    await setAppActive(user, slug, active === "true");
    // Sidebar, Apps page and the app's own page all depend on activation state.
    revalidatePath("/", "layout");
    return { ok: active === "true" ? "App activated." : "App deactivated." };
  });
}

export async function updateAppSettings(slug: string, _: FormState, form: FormData): Promise<FormState> {
  return runAction("updateAppSettings", async () => {
    const user = await requireUser();
    const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$ACTION")));
    await saveAppSettings(user, slug, values);
    revalidatePath("/", "layout");
    return { ok: "Settings saved." };
  });
}
