// Accounts (workspaces), team membership, per-member permissions and invitations.
//
// Every user OWNS exactly one account (their own workspace) and may also be a team member of
// other hosts' accounts; the session remembers which workspace they're viewing. The account owner
// is the "host"; team members share the host's plan, storage and apps. The plan is NOT stored here: it comes from the
// account's current subscription (billing.ts), and Free when there is none.
import { sql } from "drizzle-orm";
import { bigint, check, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";
import { users } from "./auth";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The host. Deleting the host deletes the workspace and everything in it.
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stripeCustomerId: text("stripe_customer_id").unique(),
    // Running total kept in step with storage_objects, so quota checks are a single atomic UPDATE.
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("accounts_storage_used_nonnegative", sql`${t.storageUsedBytes} >= 0`)],
);

export const memberRole = pgEnum("member_role", ["owner", "member"]);

export const accountMembers = pgTable(
  "account_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("account_members_account_user_idx").on(t.accountId, t.userId),
    // a person owns at most one account (their own workspace)
    uniqueIndex("account_members_one_owned_idx").on(t.userId).where(sql`${t.role} = 'owner'`),
    index("account_members_user_idx").on(t.userId),
    // exactly one owner per account
    uniqueIndex("account_members_one_owner_idx").on(t.accountId).where(sql`${t.role} = 'owner'`),
  ],
);

/**
 * What a team member may do. Owners implicitly have every permission plus owner-only actions
 * (billing, members, apps, permanent deletion), which are never grantable.
 */
export const PERMISSIONS = [
  "storage.view",
  "storage.upload",
  "storage.mark_for_deletion",
  "calendar.view",
  "calendar.edit",
  "contacts.view",
  "contacts.edit",
  "messages.use",
  "apps.use",
  "appzone.install",
  "billing.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const memberPermission = pgEnum("member_permission", PERMISSIONS);

export const memberPermissions = pgTable(
  "member_permissions",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => accountMembers.id, { onDelete: "cascade" }),
    permission: memberPermission("permission").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.permission] })],
);

export const invitationChannel = pgEnum("invitation_channel", ["email", "sms"]);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    channel: invitationChannel("channel").notNull().default("email"),
    // Exactly one of email / phone, matching the channel. Phone is E.164 (+15551234567).
    email: text("email"),
    phone: text("phone"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("invitations_email_lowercase", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
    check(
      "invitations_channel_target",
      sql`(${t.channel} = 'email' and ${t.email} is not null and ${t.phone} is null) or (${t.channel} = 'sms' and ${t.phone} is not null and ${t.email} is null)`,
    ),
    check("invitations_phone_e164", sql`${t.phone} is null or ${t.phone} ~ '^[+][1-9][0-9]{7,14}$'`),
    check("invitations_not_both_accepted_and_revoked", sql`${t.acceptedAt} is null or ${t.revokedAt} is null`),
    // one open invitation per email / phone per account
    uniqueIndex("invitations_open_email_idx")
      .on(t.accountId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null and ${t.email} is not null`),
    uniqueIndex("invitations_open_phone_idx")
      .on(t.accountId, t.phone)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null and ${t.phone} is not null`),
    index("invitations_account_idx").on(t.accountId),
  ],
);

/** Permissions the invited person will get when they accept. */
export const invitationPermissions = pgTable(
  "invitation_permissions",
  {
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    permission: memberPermission("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.invitationId, t.permission] })],
);

export type Account = typeof accounts.$inferSelect;
export type AccountMember = typeof accountMembers.$inferSelect;
