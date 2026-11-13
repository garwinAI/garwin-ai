# Garwin AI

AI-powered workspace with an AppZone marketplace for apps, widgets and themes.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Drizzle ORM · Vitest + Playwright · npm

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Spec and roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Data model and entitlement rules: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- Rules for AI assistants (Copilot etc.): [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

## Run it locally

You need **Node.js 22** (see `.nvmrc`) and a **PostgreSQL** database. Easiest options:
- Docker Desktop installed: `docker compose up -d` starts one locally.
- No Docker: create a free database at [neon.tech](https://neon.tech) and copy its connection string.

```bash
# 1. Install packages
npm install

# 2. Create your env file, then edit it (DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD)
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env

# 3. Generate a value for AUTH_SECRET and paste it into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 4. Create the tables and your Admin account
npm run db:migrate
npm run db:seed

# 5. Start the app
npm run dev
```

Open http://localhost:3000, then sign up, or log in with your `ADMIN_EMAIL`.
Without `RESEND_API_KEY`, verification and password-reset emails are printed in the terminal
running `npm run dev`; copy the link from there.
Check it's healthy at http://localhost:3000/api/health.

If anything in `.env` is missing or invalid, the server stops at startup and lists exactly which variable is wrong.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` / `npm start` | Production build / run it |
| `npm run check` | Lint + typecheck + unit tests (run before every commit) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:integration` | Auth/session/rate-limit tests against the database in `DATABASE_URL` |
| `npm run test:e2e` | Browser tests (Playwright); needs the database and `db:seed`. Uses a local fake Resend server, never real email |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Create or promote the Admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `npm run db:studio` | Browse the database in Drizzle Studio |

First time running e2e tests: `npx playwright install chromium`.

## Project layout

```
src/
  app/                 routes only
    (auth)/            login, signup
    (app)/             signed-in workspace (sidebar layout): assistant, messages, calendar,
                       apps, appzone, contacts, storage, settings/*, admin
    api/health/        public health check
    api/stripe/webhook Stripe events (checked by signature)
  components/ui/       accessible building blocks (Button, TextField, CardSection, Drawer, NavTabs...)
  components/shell/    responsive sidebar + mobile drawer, navigation config
  components/          feature components (assistant chat + floating button, ...)
  server/services/     ALL database access (users, apps, login events, entitlements, billing, assistant, admin stats)
  server/stripe/       Stripe client (the only place the Stripe key is read)
  lib/                 env, logger, errors, validation, actions, plans, entitlements, health, auth/
  db/schema/           Drizzle schema, one file per domain
  db/                  client, migrate + seed scripts
  proxy.ts             route pre-check (Next 16's replacement for middleware)
  instrumentation.ts   validates env at server start
drizzle/               SQL migrations (generated; never edit by hand)
tests/unit/            Vitest
tests/e2e/             Playwright
docs/                  architecture, roadmap
.github/               CI workflow, PR template, Copilot instructions
```

## Configuration and secrets

- Every variable is declared in `src/lib/env.ts` and listed with placeholders in `.env.example`.
- Real values go in `.env` locally and in Vercel → Project → Settings → Environment Variables in production.
- `.env` files are git-ignored. Never commit secrets or paste them into AI chats.

## Branches

- `live` is the live site. Only tested, approved changes go here.
- `dev` is work in progress. Every push to it is deployed to dev.garwinai.com.

To publish: press **Update App** on the Admin page (see below). This repo is the only copy of the app.

## Update App (publish dev to live)

Admin → **App update** compares the `dev` branch with the `live` branch on GitHub.

- When dev has changes that live doesn't, the **Update App** button is active and lists them.
  Pressing it moves `live` forward to exactly the dev version you were shown (never a force-push);
  Vercel then builds and deploys the live site.
- When live already matches dev, the button is greyed out.
- Admins get an "App update ready to publish" notification when dev moves ahead, and an "App update
  published" notification after each update. Notifications are under **Notifications** in the sidebar.
- Every update is written to the audit log (`app.updated`).

**Deploy New App Version** (Settings → General, Admins only) does the same with two buttons:

- **Deploy Now** publishes immediately (same as Update App).
- **Schedule** publishes the version you see at a date and time you pick (your local time), within
  about 15 minutes of it. Changes pushed to dev afterwards are not included. Scheduling again
  replaces the earlier schedule; **Cancel schedule** removes it.
- How scheduling works: the schedule is saved on GitHub as a tag `deploy-schedule/<time>` pointing at
  that version, and the **Scheduled deploy** GitHub Actions workflow
  (`.github/workflows/scheduled-deploy.yml`, every 10 minutes) moves `live` forward once the time has
  passed. It needs no extra secrets and works the same from dev.garwinai.com and garwinai.com. If live
  can't be moved forward (it has changes dev doesn't), the app shows the failed schedule.
- GitHub turns off scheduled workflows in repositories with no activity for 60 days; re-enable it
  under GitHub → Actions → Scheduled deploy if that ever happens.

## Launch checklist

Admin → **Launch checklist** (`/admin/launch`) lists what's left before launch: Stripe keys and
prices, the Claude Console API key, GitHub, email, changing the exposed secrets, legal pages and the
domain. Steps the app can detect (keys present, prices in Stripe, first webhook received, live mode)
tick themselves; the rest are ticked by an Admin. The dev and live sites each keep their own list.

One-time setup:

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate. Repository access:
   only `garwinAI/garwin-ai`. Permissions: **Contents: Read and write**. Copy the token.
2. Vercel → Project → Settings → Environment Variables → add `GITHUB_TOKEN` for **Production and
   Preview**, then redeploy. Without it the button stays greyed out and says so.

## Admin Assistant (edit the site from inside the app)

Admin → **Open Admin Assistant**. Describe a change in plain words; the Assistant (Claude, through
the Anthropic API) reads the code, edits it and saves the result as **one commit on `dev`**.

- The dev site rebuilds a few minutes later. The live site changes only when you press Update App.
- It can read the whole repository but cannot run, test or build the code. Check the dev site (and
  the CI result on GitHub) before publishing.
- It cannot change: CI workflows, `.env` files, `package.json`/lockfile, the database schema and
  migrations, sign-in/security/permission code, or its own code. The list is in
  `src/lib/site-editor.ts`; those changes need a developer.
- Limits: 20 files per request, 30 requests per hour, about 4 minutes of work per request. A request
  that doesn't finish saves nothing.
- Every saved change is in the audit log (`site.edited`) and in the Git history of `dev`.
- The conversation is not stored; it clears when you leave the page.

One-time setup (in Vercel → Settings → Environment Variables, for **Production and Preview**):

1. `ASSISTANT_API_KEY`: an API key from console.anthropic.com (usage is billed per token by Anthropic).
2. `GITHUB_TOKEN`: the same token the Update App button uses.
3. Optional `ASSISTANT_MODEL` (default `claude-sonnet-5-5`).

The Assistant in the sidebar (for all users) is separate and still arrives in Phase 7.

## Sites and branches on Vercel

| Site | Branch | Vercel environment |
| --- | --- | --- |
| garwinai.com | `live` | Production |
| dev.garwinai.com | `dev` | Preview (domain assigned to the `dev` branch) |

- Vercel → Settings → Domains: add `garwinai.com` (Production). Edit `dev.garwinai.com` and assign it
  to the Git branch `dev`.
- Environment variables must exist for **Preview** as well as Production. Set `APP_URL` per
  environment (`https://garwinai.com` for Production, `https://dev.garwinai.com` for Preview).
- Give dev its **own database** (a Neon branch) and set that `DATABASE_URL` for Preview, so testing
  never touches live data. Then add `MIGRATE_ON_BUILD=1` for Preview so dev deploys apply migrations
  too. Never set `MIGRATE_ON_BUILD` on an environment that shares the live database.

## First deploy (Vercel)

1. vercel.com → **Add New → Project** → import `garwinAI/garwin-ai`, production branch `live`.
2. Add environment variables: `DATABASE_URL` (the **pooled** connection string), `AUTH_SECRET` (a new
   value, not your local one), `APP_URL=https://dev.garwinai.com`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. Also add `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters). Every production deploy applies database
   migrations and creates the Admin account automatically (`scripts/vercel-build.mjs`); preview deploys never touch the database.
4. Vercel → Settings → **Domains** → add `dev.garwinai.com`, and copy the CNAME target.
5. Namecheap → Domain List → garwinai.com → **Advanced DNS** → add **CNAME**, Host `dev`, Value = Vercel's target.
6. Check `https://dev.garwinai.com/api/health` returns `"status":"ok"`.

## Set up email (Resend)

Password reset and email verification need a real email provider in production; the app won't
start without one.

1. Create an account at [resend.com](https://resend.com) → **Domains → Add domain** → `garwinai.com`.
2. Resend shows several DNS records (SPF/DKIM, usually TXT and MX). Add each one in Namecheap →
   Domain List → garwinai.com → **Advanced DNS** exactly as shown, then click **Verify** in Resend.
3. Resend → **API Keys → Create** (permission: *Sending access*, domain: garwinai.com).
4. In Vercel add `RESEND_API_KEY` (the key) and `EMAIL_FROM=Garwin AI <no-reply@garwinai.com>`.
   Never paste the key into code, chats or commits.

## Set up payments (Stripe)

Start with Stripe **test mode** on the dev site: test cards, nobody is charged. Use live keys on
the live site only at launch. Every step works from a phone browser.

**Dev site (test mode)**

1. Create an account at [stripe.com](https://stripe.com) and keep **Test mode** on (switch at the top).
2. **Developers → API keys** → reveal and copy the **Secret key** (`sk_test_...`).
3. **Developers → Webhooks → Add destination** → "Your account" → select the events listed in
   Admin → Billing (`checkout.session.completed`, the `customer.subscription.*` events,
   `invoice.paid`, `invoice.payment_failed`) → Webhook endpoint → URL
   `https://dev.garwinai.com/api/stripe/webhook` → create. Open it and reveal the **Signing secret** (`whsec_...`).
4. **Settings → Billing → Customer portal** → allow customers to update payment methods, view
   invoices and cancel subscriptions → **Save**. (Plan switching happens in Garwin AI, so leave
   "switch plans" off.)
5. Vercel → Settings → Environment Variables → add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
   for **Preview** only → redeploy dev. Never paste either key into code, chats or commits.
6. On dev.garwinai.com log in as Admin → **Admin → Plans & prices** → enter the prices → **Save prices**.
   This creates the products and prices in Stripe.
7. Test: sign up as a new user → Settings → Payments → Upgrade → card `4242 4242 4242 4242`, any
   future date, any CVC.

**Live site (at launch):** repeat steps 2–5 with Test mode **off**, the URL
`https://garwinai.com/api/stripe/webhook`, and the variables set for **Production**. Then on
garwinai.com set the prices in Admin → Plans & prices (or click **Check prices in Stripe**).

## Set up SMS invitations (Twilio)

Optional. Without it, hosts can still invite by email.

1. Create an account at [twilio.com](https://www.twilio.com) and buy a phone number with SMS.
2. For US recipients, complete **A2P 10DLC** registration (Messaging → Regulatory Compliance);
   unregistered US traffic gets blocked by carriers.
3. In Vercel add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (the number in
   `+1...` form, or a Messaging Service SID starting with `MG`). Never commit or share the token.

## Working with Copilot

Use Agent mode with one task at a time. Copilot automatically reads
`.github/copilot-instructions.md`. After each change: review the diff, run `npm run check`
(and `npm run test:e2e` for UI changes), then commit.
