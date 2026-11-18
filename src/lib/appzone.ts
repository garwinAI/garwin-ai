// AppZone upload rules shared by the developer forms, the services and the tests. No DB access.
import { z } from "zod";
import { HEX_COLOR } from "./app-icons";

export type ItemKind = "app" | "widget" | "theme";
export type AppType = "standalone" | "tool";

/** What the developer picks in "Type of item". Apps split into standalone apps and tools. */
export const ITEM_TYPES = [
  { value: "standalone", label: "Standalone app", kind: "app", appType: "standalone" },
  { value: "tool", label: "Tool that modifies an app or feature", kind: "app", appType: "tool" },
  { value: "widget", label: "Widget", kind: "widget", appType: null },
  { value: "theme", label: "Page theme", kind: "theme", appType: null },
] as const;
export type ItemType = (typeof ITEM_TYPES)[number]["value"];

export function itemTypeOf(kind: ItemKind, appType: AppType | null): ItemType {
  return kind === "app" ? (appType ?? "standalone") : kind;
}

export function itemTypeLabel(kind: ItemKind, appType: AppType | null) {
  return ITEM_TYPES.find((t) => t.value === itemTypeOf(kind, appType))!.label;
}

export const ITEM_STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "warning" },
  published: { label: "Approved · live", tone: "success" },
  rejected: { label: "Denied", tone: "danger" },
  unlisted: { label: "Unlisted", tone: "neutral" },
};

// ---------------------------------------------------------------- fees

/** One-time listing fee, charged when Admin approves the item's first version. */
export const LISTING_FEE_CENTS: Record<ItemKind, number> = { app: 3999, theme: 2999, widget: 1999 };
/** Charged for each newer version, when Admin approves it. */
export const UPDATE_FEE_CENTS = 999;

export function uploadFeeFor(kind: ItemKind, purpose: "listing" | "update") {
  return purpose === "update" ? UPDATE_FEE_CENTS : LISTING_FEE_CENTS[kind];
}

// ---------------------------------------------------------------- files

export const FILE_LIMITS = {
  icon: 256 * 1024,
  main_image: 1024 * 1024,
  gallery: 1024 * 1024,
  package: 4 * 1024 * 1024,
} as const;
export type FileRole = keyof typeof FILE_LIMITS;
export const MAX_GALLERY_IMAGES = 6;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * The real type of an upload, from its first bytes (the browser's claimed type is ignored).
 * SVG is deliberately not accepted: it can carry script.
 */
export function sniffFileType(bytes: Uint8Array): ImageType | "application/zip" | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "image/png";
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 4 && b(0) === 0x50 && b(1) === 0x4b && b(2) === 0x03 && b(3) === 0x04) return "application/zip";
  return null;
}

const ROLE_LABEL: Record<FileRole, string> = { icon: "Icon", main_image: "Main image", gallery: "Gallery image", package: "Package" };

export function formatLimit(bytes: number) {
  return bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MB` : `${bytes / 1024} KB`;
}

/** File size for people: "312 KB", "1.4 MB". */
export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Checks one upload; returns its real content type or a user-facing error. */
export function checkUpload(role: FileRole, bytes: Uint8Array): { ok: true; contentType: string } | { ok: false; error: string } {
  const label = ROLE_LABEL[role];
  if (bytes.length === 0) return { ok: false, error: `${label}: the file is empty.` };
  if (bytes.length > FILE_LIMITS[role]) return { ok: false, error: `${label} must be ${formatLimit(FILE_LIMITS[role])} or smaller.` };
  const type = sniffFileType(bytes);
  if (role === "package") {
    return type === "application/zip" ? { ok: true, contentType: type } : { ok: false, error: "Package must be a .zip file." };
  }
  return type && type !== "application/zip" ? { ok: true, contentType: type } : { ok: false, error: `${label} must be a PNG, JPEG or WebP image.` };
}

// ---------------------------------------------------------------- versions

export const versionSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, "Use a version like 1.0.0.");

export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// ---------------------------------------------------------------- prices

/** "4.99" / "$4.99" / "4" -> cents. Empty -> 0. */
export function parsePrice(raw: string): number | null {
  const v = raw.trim().replace(/^\$/, "");
  if (v === "") return 0;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

const priceField = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const cents = parsePrice(v ?? "");
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 4.99.` });
        return z.NEVER;
      }
      return cents;
    });

// ---------------------------------------------------------------- the item form

const optionalUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\/[^\s]+\.[^\s]+$/i.test(v), `${label} must start with https://`);

export const itemDetailsSchema = z
  .object({
    type: z.enum(["standalone", "tool", "widget", "theme"], "Choose what kind of item this is."),
    targetApp: z.string().trim().max(80).optional().transform((v) => v || null),
    themeLayout: z.enum(["standard"]).optional(),
    name: z.string().trim().min(2, "Enter a title.").max(60, "Title is too long (60 characters max)."),
    summary: z.string().trim().min(10, "Add a one-line summary (10+ characters).").max(140, "Summary is too long (140 characters max)."),
    description: z.string().trim().min(30, "Describe the item (30+ characters).").max(5000, "Description is too long (5,000 characters max)."),
    pricing: z.enum(["free", "paid"], "Choose Free or Paid."),
    monthlyPrice: priceField("Monthly price"),
    yearlyPrice: priceField("Yearly price"),
    mainColor: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => HEX_COLOR.test(v), "Pick a main color."),
    copyright: z.string().trim().min(3, "Add copyright info, e.g. © 2026 Your Company.").max(160),
    supportEmail: z.string().trim().toLowerCase().email("Enter a support email address.").max(254),
    websiteUrl: optionalUrl("Website"),
    privacyUrl: optionalUrl("Privacy policy"),
    version: versionSchema.optional(),
    releaseNotes: z.string().trim().max(2000).optional().transform((v) => v ?? ""),
  })
  .superRefine((v, ctx) => {
    if (v.type === "tool" && !v.targetApp) ctx.addIssue({ code: "custom", path: ["targetApp"], message: "Say which app or feature the tool modifies." });
    if (v.pricing === "paid") {
      if (v.monthlyPrice < 99 || v.yearlyPrice < 99) ctx.addIssue({ code: "custom", path: ["monthlyPrice"], message: "Paid items need a monthly and a yearly price of at least $0.99." });
    }
  })
  .transform((v) => {
    const t = ITEM_TYPES.find((x) => x.value === v.type)!;
    const paid = v.pricing === "paid";
    return {
      kind: t.kind as ItemKind,
      appType: t.appType as AppType | null,
      targetApp: v.type === "tool" ? v.targetApp : null,
      themeLayout: t.kind === "theme" ? (v.themeLayout ?? "standard") : null,
      name: v.name,
      summary: v.summary,
      description: v.description,
      priceCents: paid ? v.monthlyPrice : 0,
      yearlyPriceCents: paid ? v.yearlyPrice : 0,
      mainColor: v.mainColor,
      copyright: v.copyright,
      supportEmail: v.supportEmail,
      websiteUrl: v.websiteUrl,
      privacyUrl: v.privacyUrl,
      version: v.version ?? "1.0.0",
      releaseNotes: v.releaseNotes,
    };
  });
export type ItemDetails = z.output<typeof itemDetailsSchema>;

export const newVersionSchema = z.object({
  version: versionSchema,
  releaseNotes: z.string().trim().min(3, "Say what's new in this version.").max(2000),
});

export const developerApplicationSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your developer or company name.").max(60),
  website: optionalUrl("Website"),
  applicationNote: z.string().trim().min(20, "Tell us what you plan to build (20+ characters).").max(1000),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  note: z.string().trim().max(1000).optional().transform((v) => v ?? ""),
});

/** "My Cool App!" -> "my-cool-app" */
export function slugify(name: string) {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "item";
}

/** Which uploads are still missing before an item can be sent to Admin. */
export function missingForSubmit(input: { kind: ItemKind; hasIcon: boolean; hasMainImage: boolean; hasPackage: boolean }) {
  const missing: string[] = [];
  // Widget icons are generated (grey with white writing); everything else needs an uploaded icon.
  if (input.kind !== "widget" && !input.hasIcon) missing.push(input.kind === "theme" ? "a snapshot icon" : "an icon");
  if (!input.hasMainImage) missing.push("a main image");
  if (!input.hasPackage) missing.push("the package (.zip)");
  return missing;
}
