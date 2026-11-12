# Agent instructions

Rules for all AI coding assistants (Copilot, Claude Code, Codex, Cursor, etc.) working in this repo.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Postgres + Drizzle ORM · npm.
- **Layout and build phases:** see [`README.md`](README.md). Only Phase 1 (foundation) is built.
- **Before every commit:** `npm run check` (lint + typecheck) and `npm run build` must pass.
- **Database changes:** edit `src/db/schema.ts`, then `npm run db:generate`; never hand-edit files in `drizzle/`.
- **Secrets:** never commit `.env*` files (only `.env.example`, with placeholders). Do not upload files
  through the GitHub website: it bypasses `.gitignore`.
- **Security rules:** the "Security rules" section of the README is non-negotiable.
- **Branches:** work on `dev`; `main` is the live site and only receives merges from `dev` once the owner approves.
- **Source of truth:** this GitHub repo is the only copy of the app. There is no other version to sync with.

Quick commands: `npm run dev` · `npm run check` · `npm run build` · `npm run db:migrate` · `npm run db:seed`
