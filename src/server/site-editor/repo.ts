// Reads the dev branch and writes one commit to it, through GitHub's Git Data API.
import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { DEV_BRANCH } from "@/lib/app-update";
import { github } from "@/server/github/client";

const log = logger.child({ module: "site-editor" });

export type RepoFile = { path: string; mode: string; size: number };
export type RepoSnapshot = { commitSha: string; treeSha: string; files: Map<string, RepoFile> };
export type StagedChange = { path: string; content: string | null }; // null = delete

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    log.warn("site_editor.github_failed", { what, status: res.status });
    if (res.status === 401 || res.status === 403) {
      throw new AppError("FORBIDDEN", "GitHub refused the request. Check that GITHUB_TOKEN has “Contents: Read and write” on this repository.");
    }
    throw new Error(`GitHub ${what} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** The current tip of dev and the list of every file in it. */
export async function snapshotDev(): Promise<RepoSnapshot> {
  const ref = await json<{ object: { sha: string } }>(await github(`/git/ref/heads/${DEV_BRANCH}`, { cache: "no-store" }), "read branch");
  const commitSha = ref.object.sha;
  const commit = await json<{ tree: { sha: string } }>(await github(`/git/commits/${commitSha}`, { cache: "no-store" }), "read commit");
  const tree = await json<{ tree: { path: string; mode: string; type: string; size?: number }[] }>(
    await github(`/git/trees/${commit.tree.sha}?recursive=1`, { cache: "no-store" }),
    "list files",
  );
  const files = new Map<string, RepoFile>();
  for (const e of tree.tree) if (e.type === "blob") files.set(e.path, { path: e.path, mode: e.mode, size: e.size ?? 0 });
  return { commitSha, treeSha: commit.tree.sha, files };
}

/** File content at the snapshot's commit, as text. */
export async function readRepoFile(snapshot: RepoSnapshot, path: string): Promise<string> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await github(`/contents/${encoded}?ref=${snapshot.commitSha}`, { cache: "no-store" }, "application/vnd.github.raw+json");
  if (!res.ok) {
    log.warn("site_editor.github_failed", { what: "read file", status: res.status });
    throw new Error(`GitHub read file failed (${res.status})`);
  }
  return res.text();
}

/**
 * Saves all changes as one commit on top of the snapshot and moves dev to it. Never forces: if
 * dev moved while the Assistant was working, nothing is saved.
 */
export async function commitToDev(snapshot: RepoSnapshot, changes: StagedChange[], message: string): Promise<string> {
  const tree = await json<{ sha: string }>(
    await github("/git/trees", {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({
        base_tree: snapshot.treeSha,
        tree: changes.map((c) =>
          c.content === null
            ? { path: c.path, mode: "100644", type: "blob", sha: null }
            : { path: c.path, mode: snapshot.files.get(c.path)?.mode ?? "100644", type: "blob", content: c.content },
        ),
      }),
    }),
    "create tree",
  );
  const commit = await json<{ sha: string }>(
    await github("/git/commits", { method: "POST", cache: "no-store", body: JSON.stringify({ message, tree: tree.sha, parents: [snapshot.commitSha] }) }),
    "create commit",
  );
  const moved = await github(`/git/refs/heads/${DEV_BRANCH}`, { method: "PATCH", cache: "no-store", body: JSON.stringify({ sha: commit.sha, force: false }) });
  if (moved.status === 422) throw new AppError("CONFLICT", "The dev branch changed while the Assistant was working, so nothing was saved. Please send the request again.");
  await json(moved, "update branch");
  return commit.sha;
}
