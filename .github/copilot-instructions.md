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
| `src/components/ui/` | Shared accessible primitives (see table below). Use these before writing new markup. |
| `src/components/shell/` | App frame: responsive sidebar, mobile drawer, nav config (`nav.ts`) |
| `src/components/` | Feature components (assistant, deactivated-app, logo) |
| `src/server/services/` | **All database access.** One file per domain (`users.ts`, ...). Starts with `import "server-only"`. |
| `src/lib/` | Shared logic with no DB access: `env`, `logger`, `errors`, `validation`, `actions`, `plans`, `entitlements`, `health` |
| `src/lib/auth/` | Sessions, tokens and auth server actions |
| `src/db/schema/` | Drizzle schema, one file per domain (auth, accounts, billing, apps, storage, appzone, messaging, support, audit) |
| `src/db/` | Client, migrate and seed scripts |
| `tests/unit/` | Vitest tests for `src/lib` logic |
| `tests/e2e/` | Playwright user-flow tests |

## Rules you must follow

1. **Environment variables:** read them only through `env()` from `src/lib/env.ts`. Add new ones
   to the zod schema there **and** to `.env.example` with a placeholder. Never hard-code or log secrets.
   Never put real keys, passwords or customer data in code, tests, docs or commits.
2. **Database:** queries live in `src/server/services/*`, never in pages or components. Change the
   schema in `src/db/schema/*.ts`, run `npm run db:generate`, review and commit the migration.
   Never edit a migration that has been merged. Add constraints (check/unique/FK) for every rule
   the database can enforce, and an index for every foreign key you filter by. Money is integer cents.
3. **Validation:** validate every server action and API input with zod (`parseInput` +
   schemas from `src/lib/validation.ts`). Trust nothing from the client, including hidden fields.
4. **Server actions:** wrap the body in `runAction(name, fn, values?)` from `src/lib/actions.ts`.
   Throw `AppError(code, "User-facing message")` for expected failures. Let unexpected errors throw:
   `runAction` logs them and shows a generic message. Return `FormState`.
5. **Authorization:** every page/action/route that touches user data calls `requireSession()`,
   `requireUser()` or `requireAdmin()` from `src/lib/auth/session.ts`. `src/proxy.ts` only checks
   that a cookie exists; it is never the security boundary. Scope every query by the current
   user's id (or their host's id) inside the service, never trust ids from the client alone.
6. **Plans, limits and permissions:** use ONLY `src/server/services/entitlements.ts` (see
   `docs/DATA_MODEL.md`). Users have no plan column: the plan comes from the account's
   subscription, and team members share the host's. Before any change, call the matching
   `assertPermission`/`assertOwner`/`reserveStorage`/`assertSeatAvailable`/`acquireAppzoneItem`.
   Hiding a button is never enforcement. Inside a DB transaction, pass `tx` to helpers and never
   use the global `db` (a second connection inside a transaction can deadlock the pool).
7. **Logging:** use `logger` from `src/lib/logger.ts` (`logger.child({ module })`). Event names are
   `noun.verb` (`checkout.created`). Log ids, not personal data. No `console.log` in app code.
8. **Errors in UI:** route segments have `error.tsx` boundaries. Show friendly messages, never stack traces.
9. **Styling:** use the `src/components/ui` components and the classes in `src/app/globals.css`.
   Brand: grayscale surfaces, **blue** (`brand-*`) for actions, **orange** (`accent-*`) for highlights.
   Orange **text** must use `text-accent-700` (contrast); `accent-500/600` are for fills, icons, dots.
   Layouts must work from 360px wide: mobile first, `sm:`/`lg:` for larger screens, no horizontal scroll.
10. **Accessibility (WCAG 2.1 AA):** real `<button>`/`<a>`; every input has a label (`TextField`,
    `SelectField`); icon-only buttons use `IconButton` (label required); one `<h1>` per page
    (`PageHeader`); mark the current item with `aria-current`; decorative icons get `aria-hidden`.
    E2E tests run axe on key pages and fail on serious/critical violations.
11. **Never fake backend behavior.** No invented numbers, canned replies or pretend success. If a
    feature isn't built, show an honest state (`PlannedBadge`, disabled control with the reason)
    and leave the real logic for its phase.
12. **Tests:** add or update tests with every change. Pure logic -> unit test; user flow -> e2e.
    Run `npm run check` before finishing. E2E needs a database: `npm run test:e2e`.

## UI building blocks (`src/components/ui`)

| Component | Use for |
| --- | --- |
| `Button`, `ButtonLink`, `buttonClasses` | Actions (`variant`: primary, secondary, danger, ghost; `size`: sm, md, lg). Links that look like buttons. |
| `IconButton` | Icon-only actions; `label` is required |
| `TextField`, `SelectField` | Labelled inputs with hint/error wired to `aria-describedby` |
| `FormMessage`, `SubmitButton` | Server-action form feedback and pending state |
| `Card`, `CardSection` | Surfaces; `CardSection` renders a labelled `<section>` with a heading |
| `PageHeader`, `PageBody` | Page `<h1>` + description/actions; padded body with floating-button clearance |
| `NavTabs` | Section navigation (Settings); vertical on desktop, scrollable on mobile |
| `Drawer` | Modal side panel on native `<dialog>` (focus trap, Escape, backdrop) |
| `Badge`, `PlannedBadge` | Status labels; "Coming in Phase N" |
| `EmptyState` | Empty lists and not-yet-built areas |
| `LocalTime` | Timestamps in the viewer's time zone |

Apps: built-in apps live in `src/lib/apps.ts`; activation and settings go through
`src/server/services/apps.ts` (host-only changes, Assistant can't be deactivated). Nav items with
an `appSlug` disappear when that app is deactivated.

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
- **Auth:** use the flows in `src/server/services/auth.ts`; don't hand-roll password, session or
  token logic. Passwords: `hashPassword`/`verifyPassword` only, never logged, never returned
  (`toPublicUser`). Session and email tokens: store only `hashToken()` values, never log them.
- Clear the session cookie only with `clearedSessionCookie()` (plain delete fails for `__Host-` cookies).
- Any new state-changing **route handler** (not server action) must check `isSameOrigin()` first.
- New endpoints that can be abused (sending email, guessing secrets) need a limit from
  `LIMITS` via `enforce()` in `src/server/services/rate-limit.ts`.
- Email links carry tokens in the URL fragment (`#token=`), read with `useFragmentToken()`.
- **Multi-account access:** `requireUser()` returns the user with the `accountId` of the workspace
  the session is viewing (membership already verified). Pass that user to services; every query
  must filter by `ent.accountId`. A record from another account must produce NOT_FOUND, never
  FORBIDDEN (don't confirm it exists). Write an integration test for cross-account access on every
  new feature.
- Redirect targets from the client (e.g. `?next=`) must go through `safeNextPath()`.
- Log sensitive team, storage and billing actions with `recordAudit()`.

## How to work

- Inspect the relevant files before editing; follow existing patterns.
- Keep changes small and focused on one task. Don't reformat unrelated code.
- Ask before: adding dependencies, changing the stack, changing the database schema in a way
  that loses data, touching auth/session/payment logic, or deleting files.
- After changes, run `npm run check` (lint, typecheck, unit tests) and, for UI flows, `npm run test:e2e`.
- Update `docs/` and `README.md` when behavior, commands or env vars change.
