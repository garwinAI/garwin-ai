// Publishing dev to live from the Admin page, plus the notifications around it.
import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { shortSha, type UpdateStatus } from "@/lib/app-update";
import { fastForwardLive, fetchUpdateStatus } from "@/server/app-update/github";
import { recordAudit } from "./audit";
import { markTypeRead, notify, notifyOnce } from "./notifications";
import { enforce, LIMITS } from "./rate-limit";
import type { RequestMeta } from "./security-events";
import { listAdminIds } from "./users";

const log = logger.child({ module: "app-update" });

const AVAILABLE = "app.update_available";
const PUBLISHED = "app.updated";
const LINK = "/admin#app-update";

/**
 * Current dev-vs-live status. When dev is ahead, every Admin gets one "update available"
 * notification per dev version. Never throws: a GitHub or database hiccup must not break a page.
 */
export async function checkForUpdate(maxAgeSec?: number): Promise<UpdateStatus> {
  const status = await fetchUpdateStatus(maxAgeSec);
  if (status.state === "update_available") {
    try {
      await notifyOnce(await listAdminIds(), status.devSha, {
        type: AVAILABLE,
        title: "App update ready to publish",
        body: `${status.count} change${status.count === 1 ? "" : "s"} on dev ${status.count === 1 ? "is" : "are"} not on the live site yet.`,
        link: LINK,
      });
    } catch (err) {
      log.error("app_update.notify_failed", { err });
    }
  }
  return status;
}

/** Publishes dev to live. `expectedSha` is the dev version the Admin was shown. */
export async function publishUpdate(admin: { id: string; name: string; role: string }, expectedSha: string, meta: RequestMeta) {
  if (admin.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can update the app.");
  await enforce(`app-update:${admin.id}`, LIMITS.appUpdatePerUser);

  const status = await fetchUpdateStatus();
  if (status.state === "up_to_date") throw new AppError("CONFLICT", "The live site already matches dev.");
  if (status.state !== "update_available") throw new AppError("CONFLICT", "The app can't be updated right now. Reload the page for details.");
  if (status.devSha !== expectedSha) throw new AppError("CONFLICT", "Dev changed since this page loaded. Reload to review the latest changes, then update.");

  await fastForwardLive(status.devSha);
  log.info("app_update.published", { userId: admin.id, sha: status.devSha, count: status.count });

  await recordAudit({
    accountId: null,
    actorUserId: admin.id,
    actorType: "admin",
    action: "app.updated",
    targetType: "branch",
    targetId: "live",
    metadata: { sha: status.devSha, commits: status.count },
    meta,
  });
  await markTypeRead(AVAILABLE);
  await notify(await listAdminIds(), {
    type: PUBLISHED,
    title: "App update published",
    body: `${admin.name} published ${status.count} change${status.count === 1 ? "" : "s"} to the live site (version ${shortSha(status.devSha)}). It goes live when the build finishes, usually within a few minutes.`,
    link: LINK,
    data: { sha: status.devSha },
  });
  return status;
}
