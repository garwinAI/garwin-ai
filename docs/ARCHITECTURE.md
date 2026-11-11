# Architecture

Garwin AI is one Next.js 16 app (App Router, React 19, TypeScript) backed by PostgreSQL through
Drizzle ORM, deployed on Vercel.

## Request flow

1. **`src/proxy.ts`** (Next 16's replacement for middleware) does a fast, optimistic check of the
   signed session cookie. Signed-out visitors go to `/login`; non-admins are kept out of `/admin`.
   `/`, `/api/health`, `/api/stripe/webhook` and static files are public.
2. **Pages and server actions** do the real authorization with `requireUser()` /
   `requireAdmin()` from `src/lib/auth/session.ts`, which also checks the session against the
   database.
3. **Database access** goes through `db` from `src/db/index.ts` (one shared `pg` pool). Feature
   services with external calls live in `src/server/` (currently `src/server/billing/`).

## Authentication

- Passwords: bcrypt, 12 rounds. Minimum 10 characters.
- Sessions: an HS256 JWT (`jose`) in the `garwin_session` cookie (httpOnly, sameSite=lax, secure in
  production), valid 7 days, signed with `AUTH_SECRET`.
- Each user has a `session_version`. Changing the password or "Log out of all devices" bumps it,
  which invalidates every existing session.
- Every login attempt is written to `login_events` (shown in Settings → IP history). After 8
  failures in 15 minutes from the same email or IP address, further logins are refused until the
  window passes.
- Unknown emails are still compared against a dummy hash so response time doesn't reveal which
  emails are registered.

## Configuration

- `src/lib/env.ts` declares every environment variable and validates them with zod.
- `src/instrumentation.ts` runs that validation at server start; a bad `.env` stops the server
  with a list of every invalid variable.
- `.env.example` lists every variable with placeholder values. Real `.env` files are never
  committed.

## Billing (Stripe)

- Keys stay in environment variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), never in the
  database. Without them, billing pages explain that payments aren't switched on yet.
- `src/server/billing/service.ts` does all Stripe and billing database work; pages and actions
  call it. `src/lib/billing.ts` holds the pure rules (price parsing, which statuses keep a plan).
- **Prices:** Admin enters them in Admin → Billing. Saving creates the Stripe product/price (with
  `metadata.plan` and `metadata.interval`) and archives the previous price.
- **Subscribing:** Stripe Checkout (hosted by Stripe, so card numbers never touch our servers).
  The success page reads the session back from Stripe so the plan updates immediately.
- **Switching plans:** done in-app with `subscriptions.update` and immediate proration.
- **Cards, invoices, cancelling:** Stripe's hosted billing portal.
- **Webhook** (`/api/stripe/webhook`): verifies Stripe's signature, skips events already handled,
  then re-reads the subscription from Stripe and syncs it. Re-reading means late or out-of-order
  events can't roll a user back, and an old canceled subscription can't override a newer one.
- **Tests** use `tests/support/fake-stripe.mjs`, an in-memory imitation of the Stripe API plus fake
  Checkout and portal pages that send correctly signed webhooks.

## Apps and the shell

- First-party apps are defined in `src/lib/apps.ts`; which plan includes which app is in
  `src/lib/plans.ts`.
- AppZone (marketplace) apps will be third-party code, so they must never run on this app's
  origin. They are served from a separate domain, `APPZONE_SANDBOX_ORIGIN` (e.g.
  `https://garwinapps.com`), and shown in an iframe.
- `src/lib/appzone-sandbox.ts` decides whether that origin is safe: a bare `https` origin on a
  different site from `APP_URL` (`http://localhost` is allowed only in development). Same-site
  subdomains are rejected because they could share cookies with the app.
- `next.config.ts` sends `X-Frame-Options: DENY` everywhere and only allows framing the sandbox
  origin on `/apps/:slug/open`.

## System health

`src/lib/health.ts` turns status inputs into green / light green / yellow / red, worst wins.
Admin shows it; `/api/health` is the public liveness check (database reachable or not).

## Testing

| Layer | Tool | Location | Needs a database |
| --- | --- | --- | --- |
| Unit | Vitest | `tests/unit` | No |
| Integration | Vitest | `tests/integration` | Yes (`DATABASE_URL`) |
| End-to-end | Playwright + axe | `tests/e2e` | Yes, migrated and seeded |

E2E tests start a fake Resend/Twilio server (`tests/support/mock-providers.mjs`), so they never
send real email or SMS.
