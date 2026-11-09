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

## Authentication and account security

All flows live in `src/server/services/auth.ts` (framework-independent, integration-tested);
`src/lib/auth/actions.ts` only parses input, calls them and manages the cookie.

| Concern | Implementation |
| --- | --- |
| Password hashing | bcrypt cost 12 (`src/lib/security/password.ts`); hashes upgraded on login if the cost rises; dummy hash compared for unknown emails so timing doesn't reveal accounts |
| Password policy | 10+ chars, max 72 bytes (bcrypt limit, rejected rather than silently truncated), not a common password, not containing the email name, enough distinct characters |
| Sessions | Database rows (`sessions`). Cookie holds a random 256-bit token; DB stores only `HMAC-SHA256(AUTH_SECRET, token)`. New session on every sign-in (no fixation). Idle timeout 7 days, absolute 30 days |
| Cookie | `httpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix in production. Delete it only with `clearedSessionCookie()` (browsers ignore deleting a `__Host-` cookie without `Secure`) |
| Revocation | Logout revokes the row. Users can sign out one device, all others, or everywhere. Password change signs out other devices; password reset signs out all |
| Email verification | Users can use the app before verifying (banner + resend). Link valid 24h, single use |
| Password reset | "If an account exists…" response for every email (no enumeration); lookup and sending happen after the response (`after()`), so timing is identical. Link valid 30 min, single use; a weak new password doesn't burn the link; success emails a "password changed" notice |
| Email links | Token in the URL **fragment** (`#token=`), which browsers never send to servers, logs or `Referer`; stripped from the address bar after reading. Tokens stored as HMACs (`auth_tokens`), consumed atomically |
| Rate limiting | Postgres fixed-window counters (`rate_limits`), one atomic upsert per hit, so it works across serverless instances. Login: 5 per email+IP / 15 min, 30 per IP / 15 min, 50 per email / hour (an attacker on one network can't lock the owner out). Also sign-up, reset requests/submissions, verification resends, password changes. Limits in `LIMITS` in `src/server/services/rate-limit.ts` |
| CSRF | Server Actions: Next.js rejects POSTs whose Origin doesn't match Host; cookie is `SameSite=Lax`. Custom POST route handlers must call `isSameOrigin()` (`src/lib/security/origin.ts`). `/api/auth/session-expired` only clears cookies that are already invalid |
| Authorization | `requireSession()` / `requireUser()` / `requireAdmin()` in every page, action and route. `src/proxy.ts` only checks cookie presence for fast redirects. Service queries are scoped by user id (e.g. a user can't revoke another user's session) |
| Secrets never exposed | `toPublicUser()` strips the password hash; tokens are never logged (logger redacts `token`/`password`/`cookie`/… keys; email bodies aren't logged in production) |
| Activity history | `login_events` stores sign-ins (success/failure) and security changes with IP and user agent; shown in Settings → IP History |
| Email | `src/server/email/send.ts`: Resend over HTTPS in production (startup fails without `RESEND_API_KEY`); dev prints to the terminal |
| IP address | `x-forwarded-for`, trustworthy on Vercel (platform overwrites it); spoofable on hosts that don't |

## Plans and entitlements

See **`docs/DATA_MODEL.md`** for the schema, relationships and every rule. In short: a user's
plan comes from their **account's** current subscription (Free if none); team members share the
host's plan, storage and apps; all checks go through `src/server/services/entitlements.ts`,
which enforces limits atomically in the database.

## Apps and the shell

- **Built-in apps** are defined in `src/lib/apps.ts` (name, route, whether they can be
  deactivated, optional settings schema). Apps included in the plan are installed by default.
- **`app_installations`** stores only overrides per account: `active`
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

## Known limitations

- No two-factor authentication yet (Phase 6) and no email-address change flow.
- No Content-Security-Policy header yet.
- Sign-up reveals whether an email is registered ("already exists"); mitigated by the per-IP sign-up limit.
- `login_events`, revoked `sessions` and used `auth_tokens` have no retention/cleanup job yet.
