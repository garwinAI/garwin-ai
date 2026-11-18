import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appzoneFiles, appzoneItems, appzoneItemVersions, uploadFees } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { itemDetailsSchema } from "@/lib/appzone";
import {
  addGalleryImage,
  applyAsDeveloper,
  approveUpload,
  createItem,
  denyUpload,
  getDeveloperProfile,
  getFileForViewer,
  getItemDetail,
  listReviewQueue,
  reopenDeniedItem,
  reviewDeveloper,
  submitItem,
  uploadPackage,
} from "@/server/services/appzone";
import { getWorkspaceLayout, saveWorkspaceLayout } from "@/server/services/workspace";
import { createUser } from "@/server/services/users";
import { uniqueEmail } from "./helpers";

const meta = { ip: null, userAgent: null };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]);

const details = itemDetailsSchema.parse({
  type: "standalone",
  name: "Kanban Board",
  summary: "Plan work in columns.",
  description: "A kanban board for your workspace with cards and lanes.",
  pricing: "free",
  mainColor: "#1d4ed8",
  copyright: "© 2026 Dev Co",
  supportEmail: "help@dev.co",
});

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.code).toBe(code);
}

async function setup() {
  const admin = await createUser({ name: "Admin", email: uniqueEmail("admin"), passwordHash: "x", role: "admin" });
  const dev = await createUser({ name: "Dev", email: uniqueEmail("dev"), passwordHash: "x" });
  const stranger = await createUser({ name: "Other", email: uniqueEmail("other"), passwordHash: "x" });
  return { admin: { id: admin.id, role: "admin" }, dev: { id: dev.id, name: "Dev" }, stranger: { id: stranger.id, role: "member" } };
}

describe("AppZone uploads", () => {
  it("only approved developers can upload", async () => {
    const { admin, dev } = await setup();
    await expectAppError(createItem(dev, details, [], meta), "FORBIDDEN");
    await applyAsDeveloper(dev, { displayName: "Dev Co", website: null, applicationNote: "I build productivity widgets for teams." }, meta);
    await expectAppError(createItem(dev, details, [], meta), "FORBIDDEN");
    const p = await getDeveloperProfile(dev.id);
    await reviewDeveloper(admin, p!.id, "approve", "", meta);
    const item = await createItem(dev, details, [{ role: "icon", bytes: PNG }, { role: "main_image", bytes: PNG }], meta);
    expect(item.status).toBe("draft");
  });

  it("deny charges nothing; the developer can fix and resend; files stay private until published", async () => {
    const { admin, dev, stranger } = await setup();
    await applyAsDeveloper(dev, { displayName: "Dev Co", website: null, applicationNote: "I build productivity widgets for teams." }, meta);
    await reviewDeveloper(admin, (await getDeveloperProfile(dev.id))!.id, "approve", "", meta);
    const item = await createItem(dev, details, [{ role: "icon", bytes: PNG }, { role: "main_image", bytes: PNG }], meta);
    await addGalleryImage(dev, item.id, PNG);
    await uploadPackage(dev, item.id, ZIP);

    // Payments aren't configured in tests, so a developer can't send it (no fee could be taken).
    await expectAppError(submitItem(dev, item.id, meta), "CONFLICT");

    // Simulate a submitted upload, then deny it.
    await db.update(appzoneItemVersions).set({ submittedAt: new Date() }).where(eq(appzoneItemVersions.itemId, item.id));
    await db.update(appzoneItems).set({ status: "in_review" }).where(eq(appzoneItems.id, item.id));
    const queued = (await listReviewQueue(admin)).find((q) => q.itemId === item.id)!;
    expect(queued).toBeTruthy();

    // Approving without Stripe changes nothing and charges nothing.
    await expectAppError(approveUpload(admin, queued.versionId, "", meta), "CONFLICT");
    await expectAppError(denyUpload(admin, queued.versionId, "", meta), "VALIDATION");
    await denyUpload(admin, queued.versionId, "Main image is blurry.", meta);
    await expectAppError(denyUpload(admin, queued.versionId, "again", meta), "CONFLICT");

    const fees = await db.select().from(uploadFees).where(eq(uploadFees.itemId, item.id));
    expect(fees).toHaveLength(0);
    let detail = await getItemDetail({ id: dev.id, role: "member" }, item.id);
    expect(detail.status).toBe("rejected");

    // Draft files: only the developer and Admins.
    const [icon] = await db.select().from(appzoneFiles).where(and(eq(appzoneFiles.itemId, item.id), eq(appzoneFiles.role, "icon")));
    expect(await getFileForViewer(icon.id, stranger)).toBeNull();
    expect(await getFileForViewer(icon.id, null)).toBeNull();
    expect(await getFileForViewer(icon.id, { id: dev.id, role: "member" })).not.toBeNull();
    expect(await getFileForViewer(icon.id, admin)).not.toBeNull();
    await expectAppError(getItemDetail(stranger, item.id), "NOT_FOUND");

    await reopenDeniedItem(dev, item.id);
    detail = await getItemDetail({ id: dev.id, role: "member" }, item.id);
    expect(detail.status).toBe("draft");
    expect(detail.openVersion?.submittedAt).toBeNull();

    // Once published, images are visible to everyone; packages never are.
    await db.update(appzoneItems).set({ status: "published", publishedAt: new Date() }).where(eq(appzoneItems.id, item.id));
    expect(await getFileForViewer(icon.id, stranger)).not.toBeNull();
    const [pkg] = await db.select().from(appzoneFiles).where(and(eq(appzoneFiles.itemId, item.id), eq(appzoneFiles.role, "package")));
    expect(await getFileForViewer(pkg.id, stranger)).toBeNull();
  });

  it("rejects disguised files", async () => {
    const { admin, dev } = await setup();
    await applyAsDeveloper(dev, { displayName: "Dev Co", website: null, applicationNote: "I build productivity widgets for teams." }, meta);
    await reviewDeveloper(admin, (await getDeveloperProfile(dev.id))!.id, "approve", "", meta);
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    await expectAppError(createItem(dev, details, [{ role: "icon", bytes: svg }], meta), "VALIDATION");
    const item = await createItem(dev, details, [{ role: "main_image", bytes: PNG }], meta);
    await expectAppError(uploadPackage(dev, item.id, PNG), "VALIDATION");
  });
});

describe("workspace layout", () => {
  it("starts from the default and saves only valid layouts", async () => {
    const user = await createUser({ name: "Ws", email: uniqueEmail("ws"), passwordHash: "x" });
    const layout = await getWorkspaceLayout(user);
    expect(layout.pages[0].columns).toHaveLength(2);
    await saveWorkspaceLayout(user, { ...layout, pages: [{ ...layout.pages[0], theme: "plum" }] });
    expect((await getWorkspaceLayout(user)).pages[0].theme).toBe("plum");
    await expectAppError(saveWorkspaceLayout(user, { ...layout, pages: [{ ...layout.pages[0], theme: "<script>" }] }), "VALIDATION");
  });
});
