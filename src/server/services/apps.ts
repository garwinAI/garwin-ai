// Installed apps for an account: which built-in apps are available, active, and their settings.
import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appInstallations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { BUILT_IN_APPS, appIncludedInPlan, getBuiltInApp, resolveAppSettings, type BuiltInApp } from "@/lib/apps";
import { getEntitlements } from "./entitlements";

const log = logger.child({ module: "apps" });

type SessionUser = Parameters<typeof getEntitlements>[0];

export type InstalledApp = {
  app: BuiltInApp;
  active: boolean;
  settings: Record<string, unknown>;
};

/** Every built-in app the account's plan includes, with its activation state and settings. */
export const listInstalledApps = cache(async (user: SessionUser): Promise<InstalledApp[]> => {
  const ent = await getEntitlements(user);
  const rows = await db.select().from(appInstallations).where(eq(appInstallations.accountId, ent.accountId));
  const bySlug = new Map(rows.map((r) => [r.appSlug, r]));
  return BUILT_IN_APPS.filter((app) => appIncludedInPlan(app, ent.plan.id)).map((app) => {
    const row = bySlug.get(app.slug);
    return {
      app,
      // Apps that can't be deactivated are always active, whatever is stored.
      active: app.canDeactivate ? (row?.active ?? true) : true,
      settings: resolveAppSettings(app, row?.settings),
    };
  });
});

export async function getInstalledApp(user: SessionUser, slug: string) {
  const apps = await listInstalledApps(user);
  return apps.find((a) => a.app.slug === slug) ?? null;
}

/** True when the app is included in the plan and not deactivated. */
export async function isAppActive(user: SessionUser, slug: string) {
  return (await getInstalledApp(user, slug))?.active ?? false;
}

/** Validates that the user may manage this app and returns it. */
async function assertManageable(user: SessionUser, slug: string) {
  const app = getBuiltInApp(slug);
  if (!app) throw new AppError("NOT_FOUND", "That app doesn't exist.");
  const ent = await getEntitlements(user);
  if (!ent.canManageApps) throw new AppError("FORBIDDEN", "Only the account host can change apps.");
  if (!appIncludedInPlan(app, ent.plan.id)) throw new AppError("PLAN_LIMIT", `${app.name} isn't included in your plan.`);
  return { app, accountId: ent.accountId };
}

async function upsert(accountId: string, slug: string, userId: string, values: { active?: boolean; settings?: Record<string, unknown> }) {
  await db
    .insert(appInstallations)
    .values({ accountId, appSlug: slug, updatedBy: userId, ...values })
    .onConflictDoUpdate({
      target: [appInstallations.accountId, appInstallations.appSlug],
      set: { ...values, updatedBy: userId, updatedAt: new Date() },
    });
}

export async function setAppActive(user: SessionUser, slug: string, active: boolean) {
  const { app, accountId } = await assertManageable(user, slug);
  if (!active && !app.canDeactivate) throw new AppError("FORBIDDEN", `${app.name} can't be deactivated.`);
  await upsert(accountId, slug, user.id, { active });
  log.info(active ? "app.activated" : "app.deactivated", { accountId, app: slug, by: user.id });
}

export async function saveAppSettings(user: SessionUser, slug: string, input: Record<string, unknown>) {
  const { app, accountId } = await assertManageable(user, slug);
  if (!app.settings) throw new AppError("NOT_FOUND", `${app.name} has no settings.`);
  const parsed = app.settings.schema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Check the settings and try again.");
  await upsert(accountId, slug, user.id, { settings: parsed.data });
  log.info("app.settings_saved", { accountId, app: slug, by: user.id });
}

/** For tests and admin tooling: raw row lookup. */
export async function findInstallation(accountId: string, slug: string) {
  const [row] = await db
    .select()
    .from(appInstallations)
    .where(and(eq(appInstallations.accountId, accountId), eq(appInstallations.appSlug, slug)));
  return row ?? null;
}
