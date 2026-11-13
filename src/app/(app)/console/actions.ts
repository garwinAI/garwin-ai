"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { parseInput } from "@/lib/validation";
import { saveRecording } from "@/server/services/console";

const schema = z.object({
  text: z.string().max(2_000_000, "That recording is too long to save (2 MB limit)."),
  lineCount: z.coerce.number().int().min(0).max(100_000),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
});

export async function saveRecordingAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("saveConsoleRecording", async () => {
    const admin = await requireAdmin();
    const input = parseInput(schema, form);
    const saved = await saveRecording(
      admin,
      { text: input.text, lineCount: input.lineCount, startedAt: new Date(input.startedAt), endedAt: new Date(input.endedAt) },
      await requestMeta(),
    );
    revalidatePath("/console");
    revalidatePath("/storage");
    return { ok: `Saved "${saved.fileName}" to Storage → Console recordings.` };
  });
}
