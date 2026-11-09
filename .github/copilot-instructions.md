# Garwin AI: instructions for AI coding assistants

These rules apply to GitHub Copilot (chat, agent mode, coding agent) and any other AI assistant
working in this repository. Read `docs/ARCHITECTURE.md` before larger changes.

## Product in one paragraph

Garwin AI is an AI-powered workspace (CMS) with an AppZone marketplace for apps/plugins, widgets
and themes. Plans: Free, Starter, Plus, Pro (limits in `src/lib/plans.ts`). Hosts share storage
and plan with their team members. Admin manages members, prices, marketplace, support, Stripe,
Assistant API and system health. Full spec: `docs/ROADMAP.md`.

## Stack (do not change without asking the owner)

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4
- PostgreSQL via **Drizzle ORM** (`src/db/schema.ts`), migrations in `drizzle/`
- Auth: own signed-cookie sessions (`jose` + `bcryptjs`), no auth library
- Validation: `zod` v4. Tests: Vitest (unit) + Playwright (e2e). Package manager: **npm**
- Hosting target: Vercel (serverless). Do not add anything that needs a long-running server.
- Do not add new dependencies, services or frameworks without stating why and asking first.

## Where code goes

| Path | Put here |
| --- | --- |
| `src/app/**` | Routes only: pages, layouts, route handlers. Keep them thin. |
| `src/app/(auth)` / `src/app/(app)` | Signed-out pages / signed-in workspace (sidebar layout) |
| `src/components/` | Reusable UI. Client components only where interactivity needs it. |
| `src/server/services/` | **All database access.** One file per domain (`users.ts`, ...). Starts with `import "server-only"`. |
| `src/lib/` | Shared logic with no DB access: `env`, `logger`, `errors`, `validation`, `actions`, `plans`, `entitlements`, `health` |
| `src/lib/auth/` | Sessions, tokens and auth server actions |
| `src/db/` | Drizzle schema, client, migrate and seed scripts |
| `tests/unit/` | Vitest tests for `src/lib` logic |
| `tests/e2e/` | Playwright user-flow tests |

## Rules you must follow

1. **Environment variables:** read them only through `env()` from `src/lib/env.ts`. Add new ones
   to the zod schema there **and** to `.env.example` with a placeholder. Never hard-code or log secrets.
   Never put real keys, passwords or customer data in code, tests, docs or commits.
2. **Database:** queries live in `src/server/services/*`, never in pages or components. Change the
   schema in `src/db/schema.ts`, then run `npm run db:generate` and commit the generated migration.
   Never edit an existing migration file.
3. **Validation:** validate every server action and API input with zod (`parseInput` +
   schemas from `src/lib/validation.ts`). Trust nothing from the client, including hidden fields.
4. **Server actions:** wrap the body in `runAction(name, fn, values?)` from `src/lib/actions.ts`.
   Throw `AppError(code, "User-facing message")` for expected failures. Let unexpected errors throw:
   `runAction` logs them and shows a generic message. Return `FormState`.
5. **Authorization:** every page/action/route that touches user data calls `requireUser()` or
   `requireAdmin()` from `src/lib/auth/session.ts`. `src/proxy.ts` is only a fast pre-check, never
   the security boundary. Always scope queries by the current user's id (or their host's id).
6. **Plans:** check limits with `getEntitlements(user)` from `src/server/services/entitlements.ts`.
   **Never read `user.plan` directly**: team members inherit their host's plan.
7. **Logging:** use `logger` from `src/lib/logger.ts` (`logger.child({ module })`). Event names are
   `noun.verb` (`checkout.created`). Log ids, not personal data. No `console.log` in app code.
8. **Errors in UI:** route segments have `error.tsx` boundaries. Show friendly messages, never stack traces.
9. **Styling:** Tailwind utilities plus the classes in `src/app/globals.css` (`btn-primary`,
   `btn-secondary`, `btn-danger`, `input`, `label`, `card`). Brand: grayscale surfaces, **blue**
   (`brand-*`) for actions, **orange** (`accent-*`) for highlights only.
10. **Accessibility:** real `<button>`/`<a>`, labels on every input, `aria-label` on icon buttons.
11. **Tests:** add or update tests with every change. Pure logic -> unit test; user flow -> e2e.
    Run `npm run check` before finishing. E2E needs a database: `npm run test:e2e`.

## Non-negotiable security rules (from the product spec)

- **Never execute uploaded or developer-supplied code (PHP/JS/anything) on the main server.**
  AppZone items run sandboxed on a separate origin and talk to Garwin AI only through an
  approved, permission-scoped API.
- **Stripe webhooks are the payment source of truth.** Verify the signature with the raw body,
  store processed event ids, and make handling idempotent. Never grant a plan from a client redirect.
- **Admin support access** must be requested with a reason, explicitly approved by the user,
  time-limited, least-privilege, visible to the user, and audit-logged. Never build silent
  impersonation or "log in as user".
- Team members can mark items for deletion but **cannot permanently delete**; only the host can.
- Garwin AI commission (15%) and upload fees (app $39.99, theme $29.99, widget $19.99) are
  calculated server-side only.
- Passwords: bcrypt only, never logged, never returned from services (`toPublicUser`).

## How to work

- Inspect the relevant files before editing; follow existing patterns.
- Keep changes small and focused on one task. Don't reformat unrelated code.
- Ask before: adding dependencies, changing the stack, changing the database schema in a way
  that loses data, touching auth/session/payment logic, or deleting files.
- After changes, run `npm run check` (lint, typecheck, unit tests) and, for UI flows, `npm run test:e2e`.
- Update `docs/` and `README.md` when behavior, commands or env vars change.
