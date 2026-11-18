// AppZone marketplace: developers, items (apps/widgets/themes), versions, acquisitions,
// installations, purchases and upload fees.
//
// Item code (bundles) is stored as files and only ever runs sandboxed in the browser on a
// separate origin. Nothing here is executed on the server.
import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
/** For kind = app: a standalone app, or a tool that modifies an app or feature. */
export const appzoneAppType = pgEnum("appzone_app_type", ["standalone", "tool"]);
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
    /** MONTHLY price. 0 = free item. Free items are "eligible" for unlimited downloads on paid plans. */
    priceCents: integer("price_cents").notNull().default(0),
    yearlyPriceCents: integer("yearly_price_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    appType: appzoneAppType("app_type"),
    /** For tools: the app or feature the tool modifies (built-in app slug or free text). */
    targetApp: text("target_app"),
    /** For themes: page layout. Only "standard" exists today. */
    themeLayout: text("theme_layout"),
    /** #rrggbb; background of the item's icon and its accent in listings. */
    mainColor: text("main_color").notNull().default("#2563eb"),
    copyright: text("copyright").notNull().default(""),
    supportEmail: text("support_email"),
    websiteUrl: text("website_url"),
    privacyUrl: text("privacy_url"),
    submittedAt: ts("submitted_at"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("appzone_items_price_valid", sql`${t.priceCents} = 0 or ${t.priceCents} >= 99`),
    check("appzone_items_yearly_price_valid", sql`${t.yearlyPriceCents} = 0 or ${t.yearlyPriceCents} >= 99`),
    check("appzone_items_free_both_or_neither", sql`(${t.priceCents} = 0) = (${t.yearlyPriceCents} = 0)`),
    check("appzone_items_app_type_for_apps", sql`(${t.kind} = 'app') = (${t.appType} is not null)`),
    check("appzone_items_tool_has_target", sql`${t.appType} is distinct from 'tool' or ${t.targetApp} is not null`),
    check("appzone_items_theme_layout", sql`(${t.kind} = 'theme') = (${t.themeLayout} is not null) and (${t.themeLayout} is null or ${t.themeLayout} = 'standard')`),
    check("appzone_items_main_color", sql`${t.mainColor} ~ '^#[0-9a-f]{6}$'`),
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
    /** "db:<appzone_files.id>" once the package is uploaded; null while the version is a draft. */
    bundleStorageKey: text("bundle_storage_key"),
    bundleSha256: text("bundle_sha256"),
    releaseNotes: text("release_notes").notNull().default(""),
    /** Set when the developer sends the version to Admin. Draft = null. */
    submittedAt: ts("submitted_at"),
    reviewStatus: reviewStatus("review_status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("appzone_item_versions_item_version_idx").on(t.itemId, t.version),
    check("appzone_item_versions_semver", sql`${t.version} ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'`),
    check("appzone_item_versions_submitted_has_bundle", sql`${t.submittedAt} is null or (${t.bundleStorageKey} is not null and ${t.bundleSha256} is not null)`),
    check("appzone_item_versions_reviewed_was_submitted", sql`${t.reviewStatus} = 'pending' or ${t.submittedAt} is not null`),
    index("appzone_item_versions_review_idx").on(t.reviewStatus, t.createdAt),
    // One version in progress (draft or waiting for review) per item at a time.
    uniqueIndex("appzone_item_versions_one_open_idx").on(t.itemId).where(sql`${t.reviewStatus} = 'pending'`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const appzoneFileRole = pgEnum("appzone_file_role", ["icon", "main_image", "gallery", "package"]);

/**
 * Developer uploads: images (PNG/JPEG/WebP, checked by their bytes) and the item package (.zip).
 * Stored in Postgres and capped small (src/lib/appzone.ts). Never executed or unpacked on the server.
 */
export const appzoneFiles = pgTable(
  "appzone_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appzoneItems.id, { onDelete: "cascade" }),
    /** Packages belong to one version; images belong to the item. */
    versionId: uuid("version_id").references(() => appzoneItemVersions.id, { onDelete: "cascade" }),
    role: appzoneFileRole("role").notNull(),
    position: integer("position").notNull().default(0),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("appzone_files_package_has_version", sql`(${t.role} = 'package') = (${t.versionId} is not null)`),
    check(
      "appzone_files_type",
      sql`(${t.role} = 'package' and ${t.contentType} = 'application/zip') or (${t.role} <> 'package' and ${t.contentType} in ('image/png', 'image/jpeg', 'image/webp'))`,
    ),
    check(
      "appzone_files_size",
      sql`${t.sizeBytes} > 0 and ${t.sizeBytes} = octet_length(${t.data}) and ${t.sizeBytes} <= case ${t.role} when 'icon' then 262144 when 'package' then 4194304 else 1048576 end`,
    ),
    check("appzone_files_sha256", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex("appzone_files_one_icon_main_idx").on(t.itemId, t.role).where(sql`${t.role} in ('icon', 'main_image')`),
    uniqueIndex("appzone_files_one_package_idx").on(t.versionId).where(sql`${t.role} = 'package'`),
    index("appzone_files_item_idx").on(t.itemId, t.role, t.position),
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

export const uploadFeePurpose = pgEnum("upload_fee_purpose", ["listing", "update"]);

/**
 * Upload fees, charged ONLY when Admin approves (a denied upload is never charged):
 *   - listing: first approval of an item. App $39.99, theme $29.99, widget $19.99.
 *   - update:  each approved newer version, $9.99.
 * A row exists only once the charge succeeded.
 */
export const uploadFees = pgTable(
  "upload_fees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developerProfiles.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appzoneItems.id, { onDelete: "restrict" }),
    versionId: uuid("version_id")
      .unique()
      .references(() => appzoneItemVersions.id, { onDelete: "restrict" }),
    purpose: uploadFeePurpose("purpose").notNull().default("listing"),
    kind: appzoneItemKind("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    /** Ledger row, linked when the verified webhook arrives. */
    paymentId: uuid("payment_id")
      .unique()
      .references(() => payments.id, { onDelete: "restrict" }),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "upload_fees_amount_matches_purpose",
      sql`(${t.purpose} = 'update' and ${t.amountCents} = 999) or (${t.purpose} = 'listing' and ((${t.kind} = 'app' and ${t.amountCents} = 3999) or (${t.kind} = 'theme' and ${t.amountCents} = 2999) or (${t.kind} = 'widget' and ${t.amountCents} = 1999)))`,
    ),
    check("upload_fees_paid_has_charge", sql`${t.paidAt} is null or ${t.stripePaymentIntentId} is not null or ${t.paymentId} is not null`),
    check("upload_fees_update_has_version", sql`${t.purpose} = 'listing' or ${t.versionId} is not null`),
    uniqueIndex("upload_fees_one_listing_idx").on(t.itemId).where(sql`${t.purpose} = 'listing'`),
    index("upload_fees_developer_idx").on(t.developerId, t.createdAt),
  ],
);

export type AppzoneItem = typeof appzoneItems.$inferSelect;
export type AppzoneItemVersion = typeof appzoneItemVersions.$inferSelect;
export type DeveloperProfile = typeof developerProfiles.$inferSelect;
