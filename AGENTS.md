# Agent instructions

All AI coding assistants (Copilot, Claude Code, Codex, Cursor, etc.) follow
[`.github/copilot-instructions.md`](.github/copilot-instructions.md). It is the single source of
truth for stack, folder layout, coding rules and security requirements.

Quick commands: `npm run dev` · `npm run check` · `npm run test:e2e` · `npm run db:migrate`

Branches: work on `dev`; `live` is the live site and only receives merges from `dev` once the owner approves.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
