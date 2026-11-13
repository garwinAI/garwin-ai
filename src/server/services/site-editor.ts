// Admin Assistant: an AI agent that edits this app's source code on the dev branch.
// It can only read the repository and stage file changes; one commit is written at the end.
// It never runs code, never touches the live branch, and can't change protected areas
// (see src/lib/site-editor.ts).
import "server-only";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  commitTitle,
  MAX_FILE_BYTES,
  MAX_FILES_PER_EDIT,
  pathProblem,
  systemPrompt,
  writeProblem,
  type ChatTurn,
  type EditResult,
  type FileChange,
  type SiteEditorStatus,
} from "@/lib/site-editor";
import { githubConfigured } from "@/server/github/client";
import { callModel, type ModelMessage, type Tool, type ToolResult, type ToolUse } from "@/server/site-editor/anthropic";
import { commitToDev, readRepoFile, snapshotDev, type RepoSnapshot } from "@/server/site-editor/repo";
import { recordAudit } from "./audit";
import { enforce, LIMITS } from "./rate-limit";
import type { RequestMeta } from "./security-events";

const log = logger.child({ module: "site-editor" });

const MAX_STEPS = 30;
/** Leaves room inside the page's 300s limit to save the commit. */
const TIME_BUDGET_MS = 240_000;
const MAX_LIST = 600;

const str = { type: "string" } as const;
const TOOLS: Tool[] = [
  {
    name: "list_files",
    description: "List file paths in the repository. Pass a folder prefix such as 'src/app/' to narrow the list; omit it for everything.",
    input_schema: { type: "object", properties: { prefix: str }, additionalProperties: false },
  },
  {
    name: "read_file",
    description: "Read a text file. Returns your staged version if you already changed it.",
    input_schema: { type: "object", properties: { path: str }, required: ["path"], additionalProperties: false },
  },
  {
    name: "edit_file",
    description: "Replace one exact piece of text in an existing file. old_text must appear exactly once in the file (include surrounding lines to make it unique).",
    input_schema: { type: "object", properties: { path: str, old_text: str, new_text: str }, required: ["path", "old_text", "new_text"], additionalProperties: false },
  },
  {
    name: "write_file",
    description: "Create a file, or replace an existing file's entire content.",
    input_schema: { type: "object", properties: { path: str, content: str }, required: ["path", "content"], additionalProperties: false },
  },
  {
    name: "delete_file",
    description: "Delete a file.",
    input_schema: { type: "object", properties: { path: str }, required: ["path"], additionalProperties: false },
  },
];

export function getSiteEditorStatus(): SiteEditorStatus {
  const config = env();
  if (!config.ASSISTANT_API_KEY) return { available: false, reason: "Not set up yet: add ASSISTANT_API_KEY (an Anthropic API key) in Vercel." };
  if (!githubConfigured()) return { available: false, reason: "Not set up yet: add GITHUB_TOKEN in Vercel so the Assistant can save changes to the dev branch." };
  return { available: true, model: config.ASSISTANT_MODEL };
}

class ToolError extends Error {}

/** Files the model has changed in this request. null content = deleted. */
type Staged = Map<string, string | null>;

async function currentContent(snapshot: RepoSnapshot, staged: Staged, path: string): Promise<string> {
  if (staged.has(path)) {
    const s = staged.get(path);
    if (s === null || s === undefined) throw new ToolError("That file is deleted in your staged changes.");
    return s;
  }
  const file = snapshot.files.get(path);
  if (!file) throw new ToolError("File not found. Use list_files to see what exists.");
  if (file.size > MAX_FILE_BYTES) throw new ToolError("File is too large to read here.");
  const text = await readRepoFile(snapshot, path);
  if (text.includes("\0")) throw new ToolError("That is not a text file.");
  return text;
}

function stage(staged: Staged, path: string, content: string | null) {
  const problem = writeProblem(path);
  if (problem) throw new ToolError(`Not allowed: ${problem}. Do not try another way; tell the Admin this needs a developer.`);
  if (content !== null && Buffer.byteLength(content) > MAX_FILE_BYTES) throw new ToolError("Content is too large for one file.");
  if (!staged.has(path) && staged.size >= MAX_FILES_PER_EDIT) throw new ToolError(`At most ${MAX_FILES_PER_EDIT} files can change in one request.`);
  staged.set(path, content);
}

const text = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new ToolError(`'${name}' must be a string.`);
  return v;
};

async function runTool(use: ToolUse, snapshot: RepoSnapshot, staged: Staged): Promise<string> {
  const input = use.input ?? {};
  switch (use.name) {
    case "list_files": {
      const prefix = typeof input.prefix === "string" ? input.prefix : "";
      const paths = new Set([...snapshot.files.keys()].filter((p) => p.startsWith(prefix)));
      for (const [p, c] of staged) {
        if (c === null) paths.delete(p);
        else if (p.startsWith(prefix)) paths.add(p);
      }
      const sorted = [...paths].sort();
      if (sorted.length === 0) return "No files match that prefix.";
      const more = sorted.length > MAX_LIST ? `\n(${sorted.length - MAX_LIST} more: use a narrower prefix)` : "";
      return sorted.slice(0, MAX_LIST).join("\n") + more;
    }
    case "read_file": {
      const path = text(input.path, "path");
      const problem = pathProblem(path);
      if (problem) throw new ToolError(problem);
      return currentContent(snapshot, staged, path);
    }
    case "edit_file": {
      const path = text(input.path, "path");
      const oldText = text(input.old_text, "old_text");
      const newText = text(input.new_text, "new_text");
      const before = await currentContent(snapshot, staged, path);
      const count = oldText ? before.split(oldText).length - 1 : 0;
      if (count !== 1) throw new ToolError(`old_text must match exactly once; it matched ${count} times. Read the file and try again.`);
      stage(staged, path, before.replace(oldText, () => newText));
      return "Staged.";
    }
    case "write_file": {
      const path = text(input.path, "path");
      stage(staged, path, text(input.content, "content"));
      return "Staged.";
    }
    case "delete_file": {
      const path = text(input.path, "path");
      if (!snapshot.files.has(path) && !staged.has(path)) throw new ToolError("File not found.");
      stage(staged, path, null);
      return "Staged.";
    }
    default:
      throw new ToolError("Unknown tool.");
  }
}

/** Changes that differ from the snapshot, with how each file changed. */
function summarize(snapshot: RepoSnapshot, staged: Staged): FileChange[] {
  const out: FileChange[] = [];
  for (const [path, content] of staged) {
    const existed = snapshot.files.has(path);
    if (content === null) {
      if (existed) out.push({ path, action: "deleted" });
    } else out.push({ path, action: existed ? "updated" : "created" });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function runSiteEdit(
  admin: { id: string; name: string; role: string },
  request: { prompt: string; history: ChatTurn[] },
  meta: RequestMeta,
): Promise<EditResult> {
  if (admin.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can use the Admin Assistant.");
  const status = getSiteEditorStatus();
  if (!status.available) throw new AppError("CONFLICT", status.reason);
  await enforce(`site-edit:${admin.id}`, LIMITS.siteEditPerUser);

  const started = Date.now();
  const snapshot = await snapshotDev();
  const rules = snapshot.files.has(".github/copilot-instructions.md")
    ? (await readRepoFile(snapshot, ".github/copilot-instructions.md")).slice(0, 20_000)
    : "(none found)";
  const system = systemPrompt(rules);
  const messages: ModelMessage[] = [...request.history.map((t) => ({ role: t.role, content: t.text })), { role: "user" as const, content: request.prompt }];
  const staged: Staged = new Map();
  let tokens = 0;
  let reply: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const remaining = TIME_BUDGET_MS - (Date.now() - started);
    if (remaining < 15_000) break;
    const res = await callModel({ system, tools: TOOLS, messages, timeoutMs: remaining });
    tokens += (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "tool_use") {
      const results: ToolResult[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const use = block as ToolUse;
        try {
          results.push({ type: "tool_result", tool_use_id: use.id, content: await runTool(use, snapshot, staged) });
        } catch (err) {
          if (!(err instanceof ToolError)) throw err;
          results.push({ type: "tool_result", tool_use_id: use.id, content: err.message, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    if (res.stop_reason === "end_turn") {
      reply = res.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }
    break;
  }

  // An unfinished run is never saved: half a change could break the dev site.
  if (reply === null) {
    log.warn("site_editor.unfinished", { userId: admin.id, tokens, staged: staged.size });
    throw new AppError("CONFLICT", "That was too much for one request, so nothing was changed. Try asking for it in smaller steps.");
  }

  const files = summarize(snapshot, staged);
  if (files.length === 0) {
    log.info("site_editor.answered", { userId: admin.id, tokens });
    return { reply: reply || "Done. No changes were needed.", tokens };
  }

  const message = `${commitTitle(request.prompt)}\n\nRequested by ${admin.name} through the in-app Admin Assistant (${status.model}).`;
  const sha = await commitToDev(
    snapshot,
    files.map((f) => ({ path: f.path, content: staged.get(f.path) ?? null })),
    message,
  );
  log.info("site_editor.committed", { userId: admin.id, sha, files: files.length, tokens });
  await recordAudit({
    accountId: null,
    actorUserId: admin.id,
    actorType: "admin",
    action: "site.edited",
    targetType: "branch",
    targetId: "dev",
    metadata: { sha, files: files.map((f) => `${f.action}:${f.path}`), tokens },
    meta,
  });
  return { reply: reply || "Changes saved to dev.", commit: { sha, url: `https://github.com/${env().GITHUB_REPO}/commit/${sha}`, files }, tokens };
}
