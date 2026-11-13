// "Update App": publishing the dev branch (dev.garwinai.com) to the live branch (garwinai.com).
// Pure logic only; the GitHub calls are in src/server/app-update/github.ts.
import { z } from "zod";

export const DEV_BRANCH = "dev";
export const LIVE_BRANCH = "live";

export type UpdateChange = { sha: string; summary: string };

export type UpdateStatus =
  /** GITHUB_TOKEN is not set */
  | { state: "unconfigured" }
  /** GitHub could not be reached or refused the request */
  | { state: "unavailable" }
  /** live already contains everything on dev */
  | { state: "up_to_date" }
  | { state: "update_available"; devSha: string; count: number; changes: UpdateChange[] }
  /** live has commits that dev doesn't, so dev can't simply replace it */
  | { state: "diverged"; liveOnly: number };

const compareSchema = z.object({
  ahead_by: z.number().int().nonnegative(),
  behind_by: z.number().int().nonnegative(),
  commits: z.array(z.object({ sha: z.string(), commit: z.object({ message: z.string() }) })).default([]),
});

export const shaSchema = z.string().regex(/^[0-9a-f]{40}$/, "Reload the page and try again.");

const MAX_CHANGES = 10;

/**
 * Turns GitHub's "compare live...dev" response into a status.
 * ahead_by = commits on dev that live lacks; behind_by = commits on live that dev lacks.
 */
export function statusFromCompare(compare: unknown, devSha: string): UpdateStatus {
  const parsed = compareSchema.safeParse(compare);
  if (!parsed.success || !shaSchema.safeParse(devSha).success) return { state: "unavailable" };
  const { ahead_by, behind_by, commits } = parsed.data;
  if (ahead_by === 0) return { state: "up_to_date" };
  if (behind_by > 0) return { state: "diverged", liveOnly: behind_by };
  // GitHub lists commits oldest first and caps the list; only show them when the newest is included.
  const complete = commits.at(-1)?.sha === devSha;
  const changes = complete
    ? commits
        .slice(-MAX_CHANGES)
        .reverse()
        .map((c) => ({ sha: c.sha, summary: c.commit.message.split("\n")[0].slice(0, 120) }))
    : [];
  return { state: "update_available", devSha, count: ahead_by, changes };
}

/** Why the Update App button is disabled, or null when it can be pressed. */
export function updateBlockedReason(status: UpdateStatus): string | null {
  switch (status.state) {
    case "update_available":
      return null;
    case "up_to_date":
      return "The live site already matches dev.";
    case "unconfigured":
      return "Not set up yet: add GITHUB_TOKEN in Vercel (see README, “Update App”).";
    case "unavailable":
      return "Couldn't reach GitHub to compare dev and live. Try again in a minute.";
    case "diverged":
      return `The live branch has ${status.liveOnly} change${status.liveOnly === 1 ? "" : "s"} that dev doesn't. Merge live into dev first.`;
  }
}

export const shortSha = (sha: string) => sha.slice(0, 7);

// ---------------------------------------------------------------- scheduled deploys
//
// A scheduled deploy is a git tag `deploy-schedule/<unix seconds>` pointing at the dev version the
// Admin reviewed. The "Scheduled deploy" GitHub Actions workflow (.github/workflows/scheduled-deploy.yml)
// checks every 10 minutes and fast-forwards live to that version once its time has passed. If it
// can't, it leaves a `deploy-failed/<unix seconds>` tag so the app can show what happened. Storing
// the schedule in GitHub (not a database) means it works the same from the dev and the live site.

export const SCHEDULE_TAG_PREFIX = "deploy-schedule/";
export const FAILED_TAG_PREFIX = "deploy-failed/";
/** How long after the chosen time the workflow may take to publish (it runs every 10 minutes, and GitHub can delay it). */
export const SCHEDULE_PRECISION_MIN = 15;
export const SCHEDULE_MAX_DAYS = 60;

export type ScheduledDeploy = { kind: "scheduled" | "failed"; ref: string; at: Date; sha: string };

/** "refs/tags/deploy-schedule/1767225600" → its kind and time, or null for any other ref. */
export function parseScheduleRef(ref: string, sha: string): ScheduledDeploy | null {
  const match = ref.match(/^refs\/tags\/(deploy-schedule|deploy-failed)\/(\d{9,11})$/);
  if (!match || !shaSchema.safeParse(sha).success) return null;
  return { kind: match[1] === "deploy-schedule" ? "scheduled" : "failed", ref, at: new Date(Number(match[2]) * 1000), sha };
}

export const scheduleRefFor = (at: Date) => `refs/tags/${SCHEDULE_TAG_PREFIX}${Math.floor(at.getTime() / 1000)}`;

/** A user-facing problem with the chosen time, or null when it's fine. */
export function scheduleTimeProblem(at: Date, now = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return "Choose a date and time.";
  if (at.getTime() < now.getTime() + 5 * 60_000) return "Choose a time at least 5 minutes from now, or use Deploy Now.";
  if (at.getTime() > now.getTime() + SCHEDULE_MAX_DAYS * 86_400_000) return `Choose a time within the next ${SCHEDULE_MAX_DAYS} days.`;
  return null;
}
