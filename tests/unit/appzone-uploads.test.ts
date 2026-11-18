import { describe, expect, it } from "vitest";
import {
  checkUpload,
  compareVersions,
  itemDetailsSchema,
  LISTING_FEE_CENTS,
  missingForSubmit,
  parsePrice,
  slugify,
  sniffFileType,
  UPDATE_FEE_CENTS,
  uploadFeeFor,
} from "@/lib/appzone";
import { BUILT_IN_APPS } from "@/lib/apps";
import { BUILT_IN_THEMES, DEFAULT_THEME, widgetIconText } from "@/lib/app-icons";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP")]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("upload fees", () => {
  it("listing fees by kind, $9.99 per newer version", () => {
    expect(LISTING_FEE_CENTS).toEqual({ app: 3999, theme: 2999, widget: 1999 });
    expect(UPDATE_FEE_CENTS).toBe(999);
    expect(uploadFeeFor("widget", "update")).toBe(999);
    expect(uploadFeeFor("theme", "listing")).toBe(2999);
  });
});

describe("file checks", () => {
  it("detects real image and zip types from bytes", () => {
    expect(sniffFileType(PNG)).toBe("image/png");
    expect(sniffFileType(JPEG)).toBe("image/jpeg");
    expect(sniffFileType(WEBP)).toBe("image/webp");
    expect(sniffFileType(ZIP)).toBe("application/zip");
    expect(sniffFileType(SVG)).toBeNull();
  });

  it("rejects SVG icons, non-zip packages, empty and oversized files", () => {
    expect(checkUpload("icon", SVG).ok).toBe(false);
    expect(checkUpload("icon", ZIP).ok).toBe(false);
    expect(checkUpload("package", PNG).ok).toBe(false);
    expect(checkUpload("gallery", new Uint8Array())).toEqual({ ok: false, error: "Gallery image: the file is empty." });
    const big = new Uint8Array(256 * 1024 + 1);
    big.set(PNG);
    expect(checkUpload("icon", big)).toEqual({ ok: false, error: "Icon must be 256 KB or smaller." });
    expect(checkUpload("main_image", big)).toEqual({ ok: true, contentType: "image/png" });
    expect(checkUpload("package", ZIP)).toEqual({ ok: true, contentType: "application/zip" });
  });
});

describe("item details form", () => {
  const base = {
    type: "standalone",
    name: "Kanban Board",
    summary: "Plan work in columns.",
    description: "A kanban board for your workspace with cards and lanes.",
    pricing: "paid",
    monthlyPrice: "4.99",
    yearlyPrice: "$49.99",
    mainColor: "#1D4ED8",
    copyright: "© 2026 Dev Co",
    supportEmail: "Help@Dev.co",
  };

  it("maps types to kind/appType and parses prices to cents", () => {
    const d = itemDetailsSchema.parse(base);
    expect(d).toMatchObject({ kind: "app", appType: "standalone", priceCents: 499, yearlyPriceCents: 4999, mainColor: "#1d4ed8", supportEmail: "help@dev.co", version: "1.0.0", themeLayout: null });
  });

  it("tools must say what they modify; themes get the standard layout", () => {
    expect(itemDetailsSchema.safeParse({ ...base, type: "tool" }).success).toBe(false);
    expect(itemDetailsSchema.parse({ ...base, type: "tool", targetApp: "Wordbase" })).toMatchObject({ kind: "app", appType: "tool", targetApp: "Wordbase" });
    expect(itemDetailsSchema.parse({ ...base, type: "theme" })).toMatchObject({ kind: "theme", appType: null, themeLayout: "standard", targetApp: null });
  });

  it("free items have no prices; paid need both at $0.99+", () => {
    expect(itemDetailsSchema.parse({ ...base, pricing: "free" })).toMatchObject({ priceCents: 0, yearlyPriceCents: 0 });
    expect(itemDetailsSchema.safeParse({ ...base, yearlyPrice: "" }).success).toBe(false);
    expect(itemDetailsSchema.safeParse({ ...base, monthlyPrice: "abc" }).success).toBe(false);
  });

  it("requires https links", () => {
    expect(itemDetailsSchema.safeParse({ ...base, websiteUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(itemDetailsSchema.parse({ ...base, websiteUrl: "https://dev.co" }).websiteUrl).toBe("https://dev.co");
  });
});

describe("helpers", () => {
  it("prices, versions, slugs", () => {
    expect(parsePrice("")).toBe(0);
    expect(parsePrice("9.99")).toBe(999);
    expect(parsePrice("1.234")).toBeNull();
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    expect(slugify("My Cool App!")).toBe("my-cool-app");
    expect(slugify("!!!")).toBe("item");
  });

  it("widgets don't need an uploaded icon; everything needs a main image and package", () => {
    expect(missingForSubmit({ kind: "widget", hasIcon: false, hasMainImage: true, hasPackage: true })).toEqual([]);
    expect(missingForSubmit({ kind: "app", hasIcon: false, hasMainImage: false, hasPackage: false })).toEqual(["an icon", "a main image", "the package (.zip)"]);
  });
});

describe("icons and base apps", () => {
  it("base apps are Assistant plus Wordbase, Spreadsheets, Codebase, Messages, Calendar, Storage, Contacts", () => {
    expect(BUILT_IN_APPS.map((a) => a.slug).sort()).toEqual(["assistant", "calendar", "codebase", "contacts", "messages", "spreadsheets", "storage", "wordbase"]);
  });

  it("follows the owner's icon colors", () => {
    const icon = (slug: string) => BUILT_IN_APPS.find((a) => a.slug === slug)!.icon;
    expect(icon("wordbase")).toEqual({ glyph: "letter", bg: "#2563eb" });
    expect(icon("codebase")).toEqual({ glyph: "terminal", bg: "#000000" });
    expect(icon("spreadsheets").glyph).toBe("spreadsheet");
    expect(icon("storage")).toEqual({ glyph: "drive", bg: null });
  });

  it("Garwin Blue is the default theme and every theme uses the standard layout", () => {
    expect(DEFAULT_THEME.slug).toBe("garwin-blue");
    expect(BUILT_IN_THEMES.length).toBeGreaterThanOrEqual(3);
    for (const t of BUILT_IN_THEMES) expect(t.layout).toBe("standard");
  });

  it("widget icon text", () => {
    expect(widgetIconText("Weather")).toBe("W");
    expect(widgetIconText("To-do")).toBe("TD");
    expect(widgetIconText("to do list")).toBe("TDL");
  });
});
