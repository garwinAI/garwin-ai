// Thin GitHub REST client for this repository (no SDK). The token is read only here and is
// never logged or returned.
import "server-only";
import { env } from "@/lib/env";

export type GithubInit = RequestInit & { next?: { revalidate: number } };

export const githubConfigured = () => Boolean(env().GITHUB_TOKEN);

/** Calls `/repos/{GITHUB_REPO}{path}`. */
export function github(path: string, init: GithubInit = {}, accept = "application/vnd.github+json") {
  const config = env();
  return fetch(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.GITHUB_TOKEN}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}
