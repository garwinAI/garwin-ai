// Workspace page layout per person per workspace.
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceLayouts } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { parseLayout, layoutSchema, type WorkspaceLayout } from "@/lib/workspace";
import { getEntitlements } from "./entitlements";
import { listInstalledApps } from "./apps";

type UserRef = { id: string; accountId?: string | null };

/** Built-in apps this person can open, in the default order (for the icon bar). */
async function availableApps(user: UserRef) {
  const apps = await listInstalledApps(user);
  return apps.filter((a) => a.active).map((a) => a.app.slug);
}

export async function getWorkspaceLayout(user: UserRef): Promise<WorkspaceLayout> {
  const [ent, slugs] = await Promise.all([getEntitlements(user), availableApps(user)]);
  const [row] = await db
    .select({ layout: workspaceLayouts.layout })
    .from(workspaceLayouts)
    .where(and(eq(workspaceLayouts.userId, user.id), eq(workspaceLayouts.accountId, ent.accountId)));
  return parseLayout(row?.layout, slugs);
}

export async function saveWorkspaceLayout(user: UserRef, input: unknown) {
  const ent = await getEntitlements(user);
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "That layout couldn't be saved. Reload and try again.");
  const layout = parsed.data as unknown as Record<string, unknown>;
  await db
    .insert(workspaceLayouts)
    .values({ userId: user.id, accountId: ent.accountId, layout })
    .onConflictDoUpdate({ target: [workspaceLayouts.userId, workspaceLayouts.accountId], set: { layout, updatedAt: new Date() } });
}
