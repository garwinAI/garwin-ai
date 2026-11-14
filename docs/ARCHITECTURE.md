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

Stripe handles billing (see below). Future services (added in their phase, each optional until then): Stripe Connect for
developer payouts, object storage (R2/S3) for files, an email provider, a realtime provider for
Messages, an AI provider for the Assistant, and a **separate domain** for sandboxed AppZone items.

## Admin, remote view and Console

- **User status** (`users.status`): only `active` and `needs_attention` can sign in; the session
  check filters on it, so blocking a user ends every session immediately. `src/lib/user-status.ts`.
- **Admin lists**: `src/server/services/admin-users.ts` (users with their own workspace's plan,
  team facts, search/filter/sort; AppZone items with acquisition counts). Pure option parsing in
  `src/lib/admin-dashboard.ts`.
- **Remote view** uses the existing support-access tables: `requestRemoteView` → user's
  `decideRemoteView` (pop-up in the app layout) → `openRemoteView` checks the grant (requester,
  approved, not expired, scope) on every page and logs `support_access.viewed`. Pages read with the
  owner's identity through existing read functions only; `getThread(..., { markRead: false })`
  keeps message read-state untouched. Never impersonation: the Admin's own session is unchanged.
- **Console** reads the append-only `audit_logs` (`src/server/services/console.ts`), formats lines
  in `src/lib/console-log.ts`, and polls `/api/admin/console?afterId=` every 3 s. System events
  (health color changes, 24/48/72 h ticket reminders) are written by `runSystemChecks()` in
  `src/server/services/system.ts` when Admin home or Console loads (at most every 30 s while polling).
  The site can't record its own outage while it's down; it records the color change when it's back.
- **Recordings**: text in `console_recordings`, plus a `storage_objects` file (storage key
  `console-recording:<id>`) in the Admin's "Console recordings" folder, counted against quota.
  Deleting the file deletes the recording.

## Support and Auto Pilot

- `src/server/services/support.ts`: tickets are a `support_tickets` row plus a "support"
  conversation. Users see only tickets they opened (others are NOT_FOUND).
- `src/server/services/autopilot.ts` + `src/lib/autopilot.ts`: state in `system_status`
  ("autopilot" → on/off; `updated_at` = since). `answerTicket()` sends the thread to Claude with a
  single forced tool (`resolve_ticket`: reply + close/escalate); anything unusable or any API error
  escalates. Before posting it locks the ticket and checks nobody answered meanwhile. Escalated
  tickets (`escalated_at`) are never touched again. Triggered with `after()` when a customer writes,
  and swept when Admin home loads or Console polls.
- Admin Assistant chats are saved in `assistant_chat_messages` (View chat log).
- Widget numbers: `src/server/services/dashboard.ts` (payments ledger, audit log, users, accounts,
  `pg_database_size`); upgrade rules in `src/lib/growth.ts`.

## Publishing and launch

- **Deploy Now / Update App** fast-forward `live` to the reviewed dev commit through the GitHub API
  (`src/server/app-update/github.ts`).
- **Scheduled deploys** are git tags `deploy-schedule/<unix seconds>` created by the app; the
  `scheduled-deploy.yml` GitHub Actions workflow publishes due ones every 10 minutes with the
  workflow's own token and leaves `deploy-failed/<time>` tags on failure. No database or Vercel cron
  is involved, because the dev and live sites have separate databases and Vercel crons only run in
  production.
- **Launch checklist**: steps in `src/lib/launch-checklist.ts`; manual ticks in `launch_checklist`
  (per site), automatic steps computed from `env()` and billing data in `src/server/services/launch.ts`.

## Billing (Stripe)

- `src/server/stripe/client.ts` is the only place the Stripe key is read. `src/server/services/billing.ts`
  does all billing work; `src/lib/billing.ts` holds the pure rules (price parsing, status mapping).
- **Prices:** Admin → Billing. Saving deactivates the old `plan_prices` row, inserts a new one and
  creates the Stripe price (product id `garwin_plan_<plan>`, `metadata.plan`/`metadata.interval`),
  archiving the old Stripe price. Existing subscribers keep their price. "Check prices in Stripe"
  re-creates prices missing from the connected account (e.g. after switching test → live keys).
- **Buying:** the host only (`assertOwner`). Stripe Checkout hosts the card form. The redirect back
  never grants anything: the plan changes when the signed webhook arrives (the page refreshes
  itself for a few seconds while waiting).
- **Switching:** in-app via `subscriptions.update`, prorated immediately, then the result read back
  from Stripe is synced. **Cards, invoices, cancelling:** Stripe's billing portal.
- **Webhook** `/api/stripe/webhook` (public, authenticated by signature; not an `isSameOrigin` route):
  each event is stored in `stripe_events` first (primary key = idempotency), then the subscription
  and invoice are **re-read from Stripe** and synced, so late or out-of-order events can't roll an
  account back. Failures are stored on the event row and return 500 so Stripe retries.
- One current subscription per account is enforced by `subscriptions_one_current_idx`; the sync
  locks the account row and confirms with Stripe before marking an older subscription ended.
  Checkout is refused while an Admin-granted plan is active.
- Paid invoices and failed payments go into the `payments` ledger (Settings → Payments → Billing history).
- Tests use `tests/support/fake-stripe.mjs` (API, hosted Checkout and portal pages, signed webhooks).

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
| Everything in CI | GitHub Actions | `.github/workflows/ci.yml` | runs on pushes to live/dev and PRs |

## Known limitations

- No two-factor authentication yet (Phase 6) and no email-address change flow.
- No Content-Security-Policy header yet.
- Sign-up reveals whether an email is registered ("already exists"); mitigated by the per-IP sign-up limit.
- `login_events`, revoked `sessions` and used `auth_tokens` have no retention/cleanup job yet.
