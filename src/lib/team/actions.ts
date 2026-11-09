"use server";

// Server actions for teams, storage and messaging. Each one re-authenticates, validates input with
// zod and calls a service; the services enforce plan limits, permissions and account scoping.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { emailSchema, parseInput, uuidSchema } from "@/lib/validation";
import { PERMISSIONS } from "@/db/schema/accounts";
import { requestMeta, requireSession, getCurrentSession } from "@/lib/auth/session";
import {
  acceptInvitation,
  inviteMember,
  leaveTeam,
  previewInvitation,
  removeMember,
  resendInvitation,
  revokeInvitation,
  setMemberPermissions,
  switchWorkspace,
} from "@/server/services/team";
import { createFolder, deletePermanently, markForDeletion, unmarkForDeletion } from "@/server/services/storage";
import { findUserByEmail } from "@/server/services/users";
import { openDirectConversation, sendMessage } from "@/server/services/messaging";

const permissionList = (form: FormData) => form.getAll("permissions").map(String);

// ---------------------------------------------------------------- team

const inviteSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("email"), email: emailSchema }),
  z.object({
    channel: z.literal("sms"),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s().-]/g, ""))
      .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter the mobile number with country code, e.g. +1 555 123 4567.")),
  }),
]);

export async function inviteAction(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? "") };
  return runAction(
    "invite",
    async () => {
      const { user } = await requireSession();
      const input = parseInput(inviteSchema, form);
      await inviteMember(user, { ...input, permissions: permissionList(form) }, await requestMeta());
      revalidatePath("/settings/team");
      return { ok: input.channel === "email" ? `Invitation sent to ${input.email}.` : `Invitation texted to ${input.phone}.` };
    },
    values,
  );
}

const idSchema = (key: string) => z.object({ [key]: uuidSchema });

export async function resendInviteAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("resendInvite", async () => {
    const { user } = await requireSession();
    const { invitationId } = parseInput(idSchema("invitationId"), form) as { invitationId: string };
    await resendInvitation(user, invitationId, await requestMeta());
    return { ok: "Sent a new link. The old one no longer works." };
  });
}

export async function revokeInviteAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("revokeInvite", async () => {
    const { user } = await requireSession();
    const { invitationId } = parseInput(idSchema("invitationId"), form) as { invitationId: string };
    await revokeInvitation(user, invitationId, await requestMeta());
    revalidatePath("/settings/team");
    return { ok: "Invitation canceled." };
  });
}

export async function setPermissionsAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("setPermissions", async () => {
    const { user } = await requireSession();
    const { memberId } = parseInput(idSchema("memberId"), form) as { memberId: string };
    const perms = permissionList(form);
    z.array(z.enum(PERMISSIONS)).parse(perms);
    await setMemberPermissions(user, memberId, perms, await requestMeta());
    revalidatePath("/settings/team");
    return { ok: "Permissions saved." };
  });
}

export async function removeMemberAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("removeMember", async () => {
    const { user } = await requireSession();
    const { memberId } = parseInput(idSchema("memberId"), form) as { memberId: string };
    await removeMember(user, memberId, await requestMeta());
    revalidatePath("/settings/team");
    return { ok: "Removed from the team." };
  });
}

export async function leaveTeamAction(_: FormState): Promise<FormState> {
  const result = await runAction("leaveTeam", async () => {
    const { user } = await requireSession();
    await leaveTeam(user, user.accountId, await requestMeta());
  });
  if (result) return result;
  redirect("/assistant");
}

export async function switchWorkspaceAction(accountId: string) {
  const { user, session } = await requireSession();
  await switchWorkspace(user.id, session.id, uuidSchema.parse(accountId));
  revalidatePath("/", "layout");
  redirect("/assistant");
}

// ---------------------------------------------------------------- invitation acceptance

export type InvitePreview =
  | { valid: false }
  | {
      valid: true;
      workspace: string;
      hostName: string;
      channel: "email" | "sms";
      invitedEmail: string | null;
      /** Email invites only: whether that address already has a Garwin AI account */
      accountExists: boolean;
      signedInAs: string | null;
    };

export async function previewInviteAction(token: string): Promise<InvitePreview> {
  const preview = await previewInvitation(token);
  if (!preview) return { valid: false };
  const current = await getCurrentSession();
  return {
    valid: true,
    workspace: preview.workspace,
    hostName: preview.hostName,
    channel: preview.channel,
    // The invited address is shown so the person signs in with the right account. Only someone
    // holding a valid invitation for that address learns whether it already has an account.
    invitedEmail: preview.email,
    accountExists: preview.email ? Boolean(await findUserByEmail(preview.email)) : false,
    signedInAs: current?.user.email ?? null,
  };
}

export async function acceptInviteAction(token: string): Promise<FormState> {
  const result = await runAction("acceptInvite", async () => {
    const { user, session } = await requireSession();
    await acceptInvitation(user, token, session.id, await requestMeta());
  });
  if (result) return result;
  revalidatePath("/", "layout");
  redirect("/assistant?joined=1");
}

// ---------------------------------------------------------------- storage

const folderSchema = z.object({ name: z.string().max(300), parentId: z.union([uuidSchema, z.literal("")]) });

export async function createFolderAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("createFolder", async () => {
    const { user } = await requireSession();
    const { name, parentId } = parseInput(folderSchema, form);
    await createFolder(user, parentId || null, name, await requestMeta());
    revalidatePath("/storage");
    return { ok: "Folder created." };
  });
}

const objectSchema = z.object({ objectId: uuidSchema });

export async function markForDeletionAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("markForDeletion", async () => {
    const { user } = await requireSession();
    const { objectId } = parseInput(objectSchema, form);
    await markForDeletion(user, objectId, await requestMeta());
    revalidatePath("/storage");
    return { ok: "Marked for deletion. The host will review it." };
  });
}

export async function unmarkAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("unmark", async () => {
    const { user } = await requireSession();
    const { objectId } = parseInput(objectSchema, form);
    await unmarkForDeletion(user, objectId, await requestMeta());
    revalidatePath("/storage");
    return { ok: "No longer marked for deletion." };
  });
}

export async function deletePermanentlyAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("deletePermanently", async () => {
    const { user } = await requireSession();
    const { objectId } = parseInput(objectSchema, form);
    await deletePermanently(user, objectId, await requestMeta());
    revalidatePath("/storage");
    return { ok: "Deleted permanently." };
  });
}

// ---------------------------------------------------------------- messaging

const messageSchema = z.object({ conversationId: uuidSchema, body: z.string().max(6000) });

export async function sendMessageAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("sendMessage", async () => {
    const { user } = await requireSession();
    const { conversationId, body } = parseInput(messageSchema, form);
    await sendMessage(user, conversationId, body);
    revalidatePath("/messages");
    return { ok: "sent" };
  });
}

export async function openDirectAction(otherUserId: string) {
  const { user } = await requireSession();
  const conversation = await openDirectConversation(user, uuidSchema.parse(otherUserId));
  redirect(`/messages?c=${conversation.id}`);
}
