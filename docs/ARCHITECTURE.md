# Architecture

## Overview

```
Browser ──> Vercel (Next.js 16)
              ├─ src/proxy.ts          fast cookie check, redirects (not a security boundary)
              ├─ src/app/**            pages, layouts, route handlers (thin)
              │    └─ server actions ─> src/lib/actions.ts runAction (validation + error handling)
              ├─ src/lib/auth/*        sessions: signed JWT cookie, re-checked against DB every request
              ├─ src/server/services/* all database access (Drizzle)
              └─ src/lib/*             pure logic: env, logger, errors, validation, plans, entitlements, health
                                 │
                                 v
                           PostgreSQL (pooled connection in production)
```

Future services (added in their phase, each optional until then): Stripe (billing, Connect for
developer payouts), object storage (R2/S3) for files, an email provider, a realtime provider for
Messages, an AI provider for the Assistant, and a **separate domain** for sandboxed AppZone items.

## Request flow

1. `src/proxy.ts` verifies the session cookie's signature only. Signed-out users go to `/login`,
   non-admin tokens can't reach `/admin`. Public paths are listed in `PUBLIC_PREFIXES`.
2. The page or action calls `requireUser()` / `requireAdmin()`. This loads the user from the
   database and checks `sessionVersion`, so revoked sessions stop working immediately.
   A revoked cookie is cleared through `/api/auth/session-expired`.
3. Inputs are parsed with zod (`parseInput`). Business rules throw `AppError`.
4. Services in `src/server/services` run the queries.
5. `runAction` turns `AppError` into a form message, re-throws Next.js redirects, and logs
   unexpected errors while showing a generic message.

## Authentication

| Piece | Where | Notes |
| --- | --- | --- |
| Password hashing | `bcryptjs`, 12 rounds | Dummy hash compared for unknown emails (timing) |
| Session token | `src/lib/auth/token.ts` | HS256 JWT, 7 days, httpOnly, SameSite=Lax, Secure in prod |
| Revocation | `users.session_version` | Bumped on password change and "log out of all devices" |
| Throttling | `login_events` | 8 failures / 15 min per email or IP (to be improved in Phase 1.5) |
| CSRF | Next.js Server Actions | Built-in Origin/Host check |
| IP address | `x-forwarded-for` | Trustworthy on Vercel only; see note in `session.ts` |

Roles: `users.role` (`member` | `admin`), `users.host_id` (set for team members),
`users.developer_status` (AppZone developer applications).

## Plans and entitlements

`src/lib/plans.ts` holds spec limits (storage, team size, AppZone downloads, included apps).
Prices are **not** in code; Admin will manage them (Phase 2). Always use
`getEntitlements(user)`: team members resolve to their host's plan, and only hosts may manage
billing or permanently delete.

## Apps and the shell

- **Built-in apps** are defined in `src/lib/apps.ts` (name, route, whether they can be
  deactivated, optional settings schema). Apps included in the plan are installed by default.
- **`app_installations`** stores only overrides per account (always the host's id): `active`
  and `settings` (JSON validated by the app's zod schema). Only hosts can change them;
  Assistant can never be deactivated because the spec requires it to stay reachable.
- Deactivated apps disappear from the sidebar, show "Deactivated" on the Apps page, and their
  routes render a notice instead of the app.
- **Shell:** `AppShell` renders a collapsible sidebar on `lg+` (state in the `garwin_sidebar`
  cookie so the server renders it correctly) and a top bar + `Drawer` below `lg`. The floating
  Assistant button is rendered by the `(app)` layout on every page except `/assistant`.
- **Assistant status** comes from `getAssistantStatus()`; until an AI provider is integrated it
  reports unavailable and the UI disables input. It never fabricates replies.

## Errors and logging

- `AppError(code, publicMessage)`: expected failures, safe to show. `statusFor(code)` maps to HTTP.
- Anything else is internal: logged with full detail, user sees a generic message.
- Route boundaries: `src/app/error.tsx`, `src/app/(app)/error.tsx`, `src/app/global-error.tsx`,
  `src/app/not-found.tsx`. Server errors show a reference code (`digest`) that matches the logs.
- `logger` writes JSON lines in production and text in development, and redacts keys that look
  sensitive (password, secret, token, cookie, api key, card...). Set `LOG_LEVEL` to control output.

## Configuration

All variables are declared and validated in `src/lib/env.ts`. `src/instrumentation.ts` validates
them when the server starts, so a missing variable fails the deploy loudly instead of the first
request. `.env.example` lists every variable with placeholders.

## Health

- `GET /api/health`: public, returns `{ status, checks: { database } }`, 200 or 503. Use it for uptime monitoring.
- Admin health panel: `computeHealth()` in `src/lib/health.ts` applies the spec's
  green / light-green / yellow / red rules; the most severe finding wins.

## Testing

| Layer | Tool | Location | Command |
| --- | --- | --- | --- |
| Pure logic | Vitest | `tests/unit` | `npm test` |
| User flows | Playwright | `tests/e2e` | `npm run test:e2e` (needs a database) |
| Static checks | ESLint, tsc | n/a | `npm run lint`, `npm run typecheck` |
| Everything in CI | GitHub Actions | `.github/workflows/ci.yml` | runs on pushes to main/dev and PRs |

## Known limitations (tracked for Phase 1.5)

- No password reset or email verification yet (needs an email provider).
- Login lockout can be triggered by someone else for a given email; replace with progressive delays.
- No Content-Security-Policy header yet; no signup rate limit.
- Health "online" is assumed; real dependency checks come with Admin (Phase 6).
- `login_events` has no retention policy yet.
