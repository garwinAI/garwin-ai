// AppZone marketplace: developers, items (apps/widgets/themes), versions, acquisitions,
// installations, purchases and upload fees.
//
// Item code (bundles) is stored as files and only ever runs sandboxed in the browser on a
// separate origin. Nothing here is executed on the server.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";
import { payments } from "./billing";

export const developerStatus = pgEnum("developer_status", ["none", "pending", "approved", "denied"]);

/** A developer application and, once approved, the developer's marketplace profile. */
export const developerProfiles = pgTable(
  "developer_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    status: developerStatus("status").notNull().default("pending"),
    displayName: text("display_name").notNull(),
    website: text("website"),
    applicationNote: text("application_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    // Stripe Connect account that receives the developer's share of sales.
    stripeConnectAccountId: text("stripe_connect_account_id").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("developer_profiles_status_not_none", sql`${t.status} <> 'none'`),
    check("developer_profiles_review_consistent", sql`${t.status} = 'pending' or ${t.reviewedAt} is not null`),
    index("developer_profiles_status_idx").on(t.status, t.createdAt),
  ],
);

export const appzoneItemKind = pgEnum("appzone_item_kind", ["app", "widget", "theme"]);
export const appzoneItemStatus = pgEnum("appzone_item_status", ["draft", "in_review", "published", "rejected", "unlisted"]);

export const appzoneItems = pgTable(
  "appzone_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developerProfiles.id, { onDelete: "restrict" }),
    kind: appzoneItemKind("kind").notNull(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    status: appzoneItemStatus("status").notNull().default("draft"),
    /** 0 = free item. Free items are "eligible" for unlimited downloads on paid plans. */
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("appzone_items_price_valid", sql`${t.priceCents} = 0 or ${t.priceCents} >= 99`),
    check("appzone_items_currency_format", sql`${t.currency} ~ '^[a-z]{3}$'`),
    check("appzone_items_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("appzone_items_published_has_date", sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
    index("appzone_items_listing_idx").on(t.status, t.kind, t.publishedAt),
    index("appzone_items_developer_idx").on(t.developerId),
  ],
);

export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);

export const appzoneItemVersions = pgTable(
  "appzone_item_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appzoneItems.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    // Declared permissions/entry points; validated before review.
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    bundleStorageKey: text("bundle_storage_key").notNull(),
    bundleSha256: text("bundle_sha256").notNull(),
    reviewStatus: reviewStatus("review_status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("appzone_item_versions_item_version_idx").on(t.itemId, t.version),
    check("appzone_item_versions_semver", sql`${t.version} ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'`),
    index("appzone_item_versions_review_idx").on(t.reviewStatus, t.createdAt),
  ],
);

export const purchaseStatus = pgEnum("purchase_status", ["pending", "paid", "refunded", "failed"]);

/** Paid AppZone items. Garwin AI keeps 15%; the split is fixed at purchase time. */
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appzoneItems.id, { onDelete: "restrict" }),
    buyerUserId: uuid("buyer_user_id").references(() => users.id, { onDelete: "set null" }),
    status: purchaseStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    developerAmountCents: integer("developer_amount_cents").notNull(),
    paymentId: uuid("payment_id")
      .unique()
      .references(() => payments.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("purchases_amount_positive", sql`${t.amountCents} > 0`),
    check("purchases_split_adds_up", sql`${t.platformFeeCents} + ${t.developerAmountCents} = ${t.amountCents}`),
    check("purchases_fee_is_15_percent", sql`${t.platformFeeCents} = round(${t.amountCents} * 0.15)`),
    check("purchases_paid_has_payment", sql`${t.status} <> 'paid' or ${t.paymentId} is not null`),
    // one successful purchase of an item per account
    uniqueIndex("purchases_one_paid_idx").on(t.accountId, t.itemId).where(sql`${t.status} = 'paid'`),
    index("purchases_item_idx").on(t.itemId),
  ],
);

export const acquisitionSource = pgEnum("acquisition_source", ["free_download", "purchase", "admin_grant"]);

/**
 * Permanent record that an account owns an item. Never deleted on uninstall, which is what makes
 * the Free plan's 10-download limit LIFETIME: count rows with counts_toward_free_limit = true.
 */
export const appzoneAcquisitions = pgTable(
  "appzone_acquisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appzoneItems.id, { onDelete: "restrict" }),
    acquiredBy: uuid("acquired_by").references(() => users.id, { onDelete: "set null" }),
    source: acquisitionSource("source").notNull(),
    purchaseId: uuid("purchase_id")
      .unique()
      .references(() => purchases.id, { onDelete: "restrict" }),
    /** True only for free items acquired while the account was on a plan with a download limit. */
    countsTowardFreeLimit: boolean("counts_toward_free_limit").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("appzone_acquisitions_account_item_idx").on(t.accountId, t.itemId),
    check("appzone_acquisitions_purchase_link", sql`(${t.source} = 'purchase') = (${t.purchaseId} is not null)`),
    check("appzone_acquisitions_only_free_counts", sql`not ${t.countsTowardFreeLimit} or ${t.source} = 'free_download'`),
    index("appzone_acquisitions_limit_idx").on(t.accountId).where(sql`${t.countsTowardFreeLimit}`),
  ],
);

/** Items currently installed in an account (can be removed and re-added; ownership stays). */
export const appzoneInstallations = pgTable(
  "appzone_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appzoneItems.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => appzoneItemVersions.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    installedBy: uuid("installed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("appzone_installations_account_item_idx").on(t.accountId, t.itemId)],
);

/** One-time listing fees: app $39.99, theme $29.99, widget $19.99 (enforced by constraint). */
export const uploadFees = pgTable(
  "upload_fees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developerProfiles.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .unique()
      .references(() => appzoneItems.id, { onDelete: "restrict" }),
    kind: appzoneItemKind("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentId: uuid("payment_id")
      .unique()
      .references(() => payments.id, { onDelete: "restrict" }),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "upload_fees_amount_matches_kind",
      sql`(${t.kind} = 'app' and ${t.amountCents} = 3999) or (${t.kind} = 'theme' and ${t.amountCents} = 2999) or (${t.kind} = 'widget' and ${t.amountCents} = 1999)`,
    ),
    check("upload_fees_paid_has_payment", sql`${t.paidAt} is null or ${t.paymentId} is not null`),
  ],
);

export type AppzoneItem = typeof appzoneItems.$inferSelect;
