# Instructions for AI coding assistants

These rules apply to every AI assistant working in this repository (Copilot, Claude Code, Codex,
Cursor...). Background: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL + Drizzle ORM
· zod · jose · Vitest + Playwright · npm · Node 22. Do not add another framework, ORM, CSS library
or package manager.

## Where things go

- `src/app/` routes only: pages, layouts, route handlers. Keep logic out of them.
- `src/components/` shared UI; `src/components/shell/` sidebar and navigation.
- `src/lib/` pure logic and helpers (plans, apps, health, env, auth). Anything without database
  access belongs here and gets unit tests.
- `src/server/<feature>/` server-only services that combine the database with outside services
  (e.g. `src/server/billing/` for Stripe), plus that feature's server actions.
- `src/db/schema.ts` the only place tables are defined. After changing it run
  `npm run db:generate` and commit the new file in `drizzle/`. Never hand-edit `drizzle/`.
- Tests: `tests/unit` (no database), `tests/integration` (database), `tests/e2e` (browser).
- Docs: `docs/`. Update them when behaviour they describe changes.

## Coding rules

- Server components by default; add `"use client"` only when a component needs state or events.
- Mutations are server actions (`"use server"`) that validate input with zod and return a
  `FormState` (`{ error } | { ok }`) instead of throwing for user mistakes.
- Use the `db` export from `src/db/index.ts`; never create another pool.
- New environment variables: declare them in `src/lib/env.ts` and add a placeholder to
  `.env.example` in the same change.
- Keep files small and focused; match the existing naming and formatting.
- Plan limits come from `src/lib/plans.ts`; prices are never hard-coded.
- Placeholder features show `<ComingSoon phase={n} />` with their roadmap phase.

## Security (non-negotiable)

- Every page, action and route handler that touches user data calls `requireUser()` or
  `requireAdmin()`. `src/proxy.ts` is only a convenience redirect, never the access check.
- Scope every query to the signed-in user (or their host's team) unless it's an Admin action.
- Never send `password_hash` or other users' private data to the browser.
- Never commit secrets: `.env*` files (except `.env.example`) stay out of git. Never paste keys
  into code, tests, docs or chats.
- No `dangerouslySetInnerHTML` with user content. No `eval`.
- AppZone app code only ever runs on `APPZONE_SANDBOX_ORIGIN` inside an iframe, never on this
  app's origin.
- Changing a password or "log out everywhere" must bump `session_version`.
- Stripe: never trust plan or price data from the browser or from an unverified webhook. Verify
  webhook signatures, and re-read subscriptions from Stripe before changing a user's plan.
  Card details are only ever entered on Stripe's own pages.

## Accessibility

Use real `<label>`s, buttons for actions and links for navigation, visible focus states, and text
contrast of at least 4.5:1 (use `text-accent-700`, not `-500`/`-600`, for small orange text).
E2E tests run axe on pages.

## Before every commit

`npm run check` (lint + typecheck + unit tests) must pass. For UI changes also run
`npm run test:e2e`. Work on one task at a time and keep each pull request focused.
