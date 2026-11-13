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
