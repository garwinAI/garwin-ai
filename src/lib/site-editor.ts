// Admin Assistant: rules for what the in-app AI editor may read and change.
// Pure logic only; GitHub and AI calls are in src/server/site-editor/.
import { z } from "zod";

export const MAX_FILES_PER_EDIT = 20;
export const MAX_FILE_BYTES = 200_000;
export const MAX_HISTORY_TURNS = 20;
export const MAX_PROMPT_CHARS = 4_000;

/**
 * Areas the Admin Assistant must not change. These need a developer: they can break sign-in,
 * leak secrets, lose data, or can't be done correctly without running tools (npm, drizzle-kit).
 */
const PROTECTED: { test: (p: string) => boolean; reason: string }[] = [
  { test: (p) => p.startsWith(".github/workflows/"), reason: "CI workflows are protected" },
  { test: (p) => p.split("/").some((s) => s.startsWith(".env") && s !== ".env.example"), reason: "environment files hold secrets" },
  { test: (p) => p === "package.json" || p === "package-lock.json", reason: "dependencies can't be changed here (the lockfile needs npm)" },
  { test: (p) => p.startsWith("drizzle/") || p.startsWith("src/db/"), reason: "database schema and migrations need drizzle-kit and a review" },
  {
    test: (p) =>
      p.startsWith("src/lib/auth/") ||
      p.startsWith("src/lib/security/") ||
      p === "src/proxy.ts" ||
      p === "src/lib/env.ts" ||
      /^src\/server\/services\/(auth|auth-tokens|sessions|rate-limit|entitlements|security-events|audit)\.ts$/.test(p),
    reason: "sign-in, security and permission code is protected",
  },
  {
    test: (p) => p.startsWith("src/server/site-editor/") || p.startsWith("src/server/app-update/") || p.startsWith("src/server/github/") || p === "src/lib/site-editor.ts",
    reason: "the Admin Assistant can't change its own rules or the publishing code",
  },
];

/** Why a repository path is malformed, or null when it is a normal relative file path. */
export function pathProblem(path: string): string | null {
  if (!path || path.length > 200) return "path is empty or too long";
  if (path.startsWith("/") || path.endsWith("/") || path.includes("\\") || /[\0-\x1f]/.test(path)) return "path must be a relative file path";
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return "path must not contain empty, '.' or '..' segments";
  if (segments[0] === ".git" || segments.includes("node_modules")) return "path is not part of the source code";
  return null;
}

/** Why a path can't be written or deleted, or null when it can. */
export function writeProblem(path: string): string | null {
  return pathProblem(path) ?? PROTECTED.find((r) => r.test(path))?.reason ?? null;
}

export const PROTECTED_SUMMARY =
  "CI workflows, environment files, package.json and the lockfile, the database schema and migrations, sign-in/security/permission code, and the Admin Assistant's own code";

const turnSchema = z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(8_000) });

export const editRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Type what you'd like to change.").max(MAX_PROMPT_CHARS, `Keep requests under ${MAX_PROMPT_CHARS} characters.`),
  history: z.array(turnSchema).max(MAX_HISTORY_TURNS * 2).default([]),
});

export type ChatTurn = z.infer<typeof turnSchema>;

export type FileChange = { path: string; action: "created" | "updated" | "deleted" };

export type EditResult = {
  reply: string;
  /** Present when the request changed files: one commit on the dev branch */
  commit?: { sha: string; url: string; files: FileChange[] };
  tokens: number;
};

export type SiteEditorStatus = { available: true; model: string } | { available: false; reason: string };

/** First line of the request, shortened, for the commit title. */
export function commitTitle(prompt: string): string {
  const first = prompt.trim().split("\n")[0].replace(/\s+/g, " ");
  return `Admin Assistant: ${first.length > 60 ? first.slice(0, 57) + "..." : first}`;
}

export function systemPrompt(repoInstructions: string): string {
  return `You are the Admin Assistant inside Garwin AI, a Next.js web app. The site's owner (an Admin, usually on a phone, not necessarily a programmer) asks you to change the website. You edit the app's own source code in its GitHub repository.

How your changes take effect:
- Your file changes are saved as ONE commit on the "dev" branch when you finish. The dev site rebuilds from it in a few minutes. The live site changes only when the Admin presses "Update App" on the Admin page.
- Nothing is saved if you stop without calling write_file, edit_file or delete_file. Answering a question needs no changes.

How to work:
- Start with list_files and read_file to find and understand the relevant code. Never guess a file's contents: read it before editing it.
- Follow the repository rules below exactly (folder layout, UI components, accessibility, security). Match the existing code style.
- Make the smallest change that does what was asked. Keep the app building: TypeScript must type-check, imports must exist. You cannot run the code, tests or a build, so be careful and conservative.
- You cannot change: ${PROTECTED_SUMMARY}. You cannot add npm packages or change the database schema. If a request needs any of that, make no changes and say plainly that it needs a developer, and why.
- If the request is unclear or risky, ask one short question instead of changing anything.
- Never put secrets, API keys, passwords or real personal data in code.

Your final message is shown to the Admin as plain text (no Markdown). Keep it short: what you changed in everyday words, anything they should check on the dev site, and anything you could not do. Do not paste code unless asked.

Repository rules (from .github/copilot-instructions.md):
${repoInstructions}`;
}
