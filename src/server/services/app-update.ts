// Publishing dev to live from the Admin page, plus the notifications around it.
import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseScheduleRef, scheduleRefFor, scheduleTimeProblem, shortSha, type UpdateStatus } from "@/lib/app-update";
import {
  createScheduleTag,
  deleteScheduleTag,
  fastForwardLive,
  fetchUpdateStatus,
  listScheduledDeploys,
} from "@/server/app-update/github";
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

// ---------------------------------------------------------------- scheduled deploys

type Admin = { id: string; name: string; role: string };

function assertAdmin(admin: Admin) {
  if (admin.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can update the app.");
}

/** The pending schedule (at most one) and any failed scheduled attempts. Never throws. */
export async function getDeploySchedule() {
  try {
    const all = await listScheduledDeploys();
    return { scheduled: all.find((d) => d.kind === "scheduled") ?? null, failed: all.filter((d) => d.kind === "failed"), ok: true as const };
  } catch (err) {
    log.warn("app_update.schedule_list_failed", { err });
    return { scheduled: null, failed: [], ok: false as const };
  }
}

/**
 * Schedules publishing the dev version the Admin reviewed (`expectedSha`) at `at`. Replaces any
 * earlier schedule, so there is never more than one.
 */
export async function scheduleUpdate(admin: Admin, expectedSha: string, at: Date, meta: RequestMeta) {
  assertAdmin(admin);
  await enforce(`app-schedule:${admin.id}`, LIMITS.appSchedulePerUser);
  const problem = scheduleTimeProblem(at);
  if (problem) throw new AppError("VALIDATION", problem);

  const status = await fetchUpdateStatus();
  if (status.state === "up_to_date") throw new AppError("CONFLICT", "The live site already matches dev.");
  if (status.state !== "update_available") throw new AppError("CONFLICT", "The app can't be updated right now. Reload the page for details.");
  if (status.devSha !== expectedSha) throw new AppError("CONFLICT", "Dev changed since this page loaded. Reload to review the latest changes, then schedule.");

  const ref = scheduleRefFor(at);
  const { scheduled } = await getDeploySchedule();
  await createScheduleTag(ref, status.devSha);
  if (scheduled && scheduled.ref !== ref) await deleteScheduleTag(scheduled.ref);

  log.info("app_update.scheduled", { userId: admin.id, sha: status.devSha, at: at.toISOString() });
  await recordAudit({
    accountId: null,
    actorUserId: admin.id,
    actorType: "admin",
    action: "app.update_scheduled",
    targetType: "branch",
    targetId: "live",
    metadata: { sha: status.devSha, commits: status.count, at: at.toISOString(), replaced: scheduled?.at.toISOString() ?? null },
    meta,
  });
  await notify(await listAdminIds(), {
    type: "app.update_scheduled",
    title: "App update scheduled",
    body: `${admin.name} scheduled ${status.count} change${status.count === 1 ? "" : "s"} (version ${shortSha(status.devSha)}) to go live at ${at.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    link: "/settings/general#deploy",
    data: { sha: status.devSha, at: at.toISOString() },
  });
}

/** Cancels a pending schedule, or dismisses a failed attempt. */
export async function removeScheduledDeploy(admin: Admin, ref: string, meta: RequestMeta) {
  assertAdmin(admin);
  const parsed = parseScheduleRef(ref, "0".repeat(40));
  if (!parsed) throw new AppError("VALIDATION", "Reload the page and try again.");
  await deleteScheduleTag(ref);
  await recordAudit({
    accountId: null,
    actorUserId: admin.id,
    actorType: "admin",
    action: parsed.kind === "scheduled" ? "app.update_schedule_canceled" : "app.update_failure_dismissed",
    targetType: "branch",
    targetId: "live",
    metadata: { at: parsed.at.toISOString() },
    meta,
  });
  return parsed.kind;
}
