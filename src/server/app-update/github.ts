// GitHub calls behind the Admin "Update App" button. Uses the HTTPS API directly (no SDK).
import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { github, githubConfigured, type GithubInit } from "@/server/github/client";
import { DEV_BRANCH, LIVE_BRANCH, statusFromCompare, type UpdateStatus } from "@/lib/app-update";

const log = logger.child({ module: "app-update" });

/**
 * Compares dev with live. `maxAgeSec` allows a cached answer (used by the layout, which runs on
 * every page); omit it for a fresh answer (Admin page, publishing).
 */
export async function fetchUpdateStatus(maxAgeSec?: number): Promise<UpdateStatus> {
  if (!githubConfigured()) return { state: "unconfigured" };
  const cache: GithubInit = maxAgeSec ? { next: { revalidate: maxAgeSec } } : { cache: "no-store" };
  try {
    const [compareRes, devRes] = await Promise.all([
      github(`/compare/${LIVE_BRANCH}...${DEV_BRANCH}?per_page=100`, cache),
      github(`/commits/${DEV_BRANCH}`, cache, "application/vnd.github.sha"),
    ]);
    if (!compareRes.ok || !devRes.ok) {
      log.warn("app_update.check_failed", { compareStatus: compareRes.status, devStatus: devRes.status });
      return { state: "unavailable" };
    }
    return statusFromCompare(await compareRes.json(), (await devRes.text()).trim());
  } catch (err) {
    log.warn("app_update.check_failed", { err });
    return { state: "unavailable" };
  }
}

/** Moves live forward to `sha`. Never forces: fails if live has commits that `sha` doesn't contain. */
export async function fastForwardLive(sha: string): Promise<void> {
  const res = await github(`/git/refs/heads/${LIVE_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha, force: false }), cache: "no-store" });
  if (res.ok) return;
  log.warn("app_update.publish_rejected", { status: res.status });
  if (res.status === 422) throw new AppError("CONFLICT", "The live branch has changes that dev doesn't. Merge live into dev first.");
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new AppError("FORBIDDEN", "GitHub refused the update. Check that GITHUB_TOKEN has “Contents: Read and write” on this repository and that the live branch isn't protected.");
  }
  throw new Error(`GitHub rejected the live branch update (${res.status})`);
}
