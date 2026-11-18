"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { developerApplicationSchema, itemDetailsSchema, newVersionSchema, type FileRole } from "@/lib/appzone";
import { parseInput, uuidSchema } from "@/lib/validation";
import {
  addGalleryImage,
  applyAsDeveloper,
  createItem,
  removeGalleryImage,
  reopenDeniedItem,
  submitItem,
  submitNewVersion,
  updateItemDetails,
  uploadPackage,
  type Upload,
} from "@/server/services/appzone";

/** Text fields only, so errors can refill the form (files can't be restored). */
function textValues(form: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

/** A chosen file's bytes, or null when the input was left empty. */
async function fileBytes(form: FormData, name: string): Promise<Uint8Array | null> {
  const f = form.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  return new Uint8Array(await f.arrayBuffer());
}

async function imageUploads(form: FormData, roles: FileRole[]): Promise<Upload[]> {
  const out: Upload[] = [];
  for (const role of roles) {
    const bytes = await fileBytes(form, role);
    if (bytes) out.push({ role, bytes });
  }
  return out;
}

export async function applyAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction(
    "developerApply",
    async () => {
      const user = await requireUser();
      const input = parseInput(developerApplicationSchema, form);
      await applyAsDeveloper(user, input, await requestMeta());
      revalidatePath("/appzone/developer");
      return { ok: "Application sent. You'll get a notification when Admin reviews it." };
    },
    textValues(form),
  );
}

export async function createItemAction(_: FormState, form: FormData): Promise<FormState> {
  const values = textValues(form);
  let itemId = "";
  const result = await runAction(
    "appzoneCreateItem",
    async () => {
      const user = await requireUser();
      const details = parseInput(itemDetailsSchema, form);
      const images = await imageUploads(form, ["icon", "main_image"]);
      if (details.kind !== "widget" && !images.some((i) => i.role === "icon")) throw new AppError("VALIDATION", details.kind === "theme" ? "Upload a snapshot of your theme for its icon." : "Upload an icon.");
      if (!images.some((i) => i.role === "main_image")) throw new AppError("VALIDATION", "Upload a main image.");
      const item = await createItem(user, details, images.filter((i) => details.kind !== "widget" || i.role !== "icon"), await requestMeta());
      itemId = item.id;
    },
    values,
  );
  if (itemId) redirect(`/appzone/developer/${itemId}?created=1`);
  return result;
}

export async function updateItemAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction(
    "appzoneUpdateItem",
    async () => {
      const user = await requireUser();
      const itemId = uuidSchema.parse(form.get("itemId"));
      const details = parseInput(itemDetailsSchema, form);
      const images = await imageUploads(form, details.kind === "widget" ? ["main_image"] : ["icon", "main_image"]);
      await updateItemDetails(user, itemId, details, images, await requestMeta());
      revalidatePath(`/appzone/developer/${itemId}`);
      return { ok: "Saved." };
    },
    textValues(form),
  );
}

const itemIdSchema = z.object({ itemId: uuidSchema });

export async function galleryAddAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("appzoneGalleryAdd", async () => {
    const user = await requireUser();
    const { itemId } = parseInput(itemIdSchema, form);
    const bytes = await fileBytes(form, "image");
    if (!bytes) throw new AppError("VALIDATION", "Choose an image to add.");
    await addGalleryImage(user, itemId, bytes);
    revalidatePath(`/appzone/developer/${itemId}`);
    return { ok: "Image added." };
  });
}

export async function galleryRemoveAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("appzoneGalleryRemove", async () => {
    const user = await requireUser();
    const { itemId, fileId } = parseInput(z.object({ itemId: uuidSchema, fileId: uuidSchema }), form);
    await removeGalleryImage(user, fileId);
    revalidatePath(`/appzone/developer/${itemId}`);
    return { ok: "Image removed." };
  });
}

export async function packageAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("appzonePackage", async () => {
    const user = await requireUser();
    const { itemId } = parseInput(itemIdSchema, form);
    const bytes = await fileBytes(form, "package");
    if (!bytes) throw new AppError("VALIDATION", "Choose your .zip package.");
    await uploadPackage(user, itemId, bytes);
    revalidatePath(`/appzone/developer/${itemId}`);
    return { ok: "Package uploaded." };
  });
}

export async function submitItemAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("appzoneSubmit", async () => {
    const user = await requireUser();
    const { itemId } = parseInput(itemIdSchema, form);
    await submitItem(user, itemId, await requestMeta());
    revalidatePath("/appzone/developer", "layout");
    return { ok: "Sent to Admin for review. You're only charged if it's approved." };
  });
}

export async function reopenAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("appzoneReopen", async () => {
    const user = await requireUser();
    const { itemId } = parseInput(itemIdSchema, form);
    await reopenDeniedItem(user, itemId);
    revalidatePath(`/appzone/developer/${itemId}`);
    return { ok: "Reopened. Make your changes, then send it again." };
  });
}

export async function newVersionAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction(
    "appzoneNewVersion",
    async () => {
      const user = await requireUser();
      const { itemId } = parseInput(itemIdSchema, form);
      const input = parseInput(newVersionSchema, form);
      const bytes = await fileBytes(form, "package");
      if (!bytes) throw new AppError("VALIDATION", "Choose the .zip package for the new version.");
      await submitNewVersion(user, itemId, input, bytes, await requestMeta());
      revalidatePath(`/appzone/developer/${itemId}`);
      return { ok: `Version ${input.version} sent for review. $9.99 is charged only if it's approved.` };
    },
    textValues(form),
  );
}
