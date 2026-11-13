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
  components/ui/       accessible building blocks (Button, TextField, CardSection, Drawer, NavTabs...)
  components/shell/    responsive sidebar + mobile drawer, navigation config
  components/          feature components (assistant chat + floating button, ...)
  server/services/     ALL database access (users, apps, login events, entitlements, assistant, admin stats)
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

One-time setup:

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate. Repository access:
   only `garwinAI/garwin-ai`. Permissions: **Contents: Read and write**. Copy the token.
2. Vercel → Project → Settings → Environment Variables → add `GITHUB_TOKEN` for **Production and
   Preview**, then redeploy. Without it the button stays greyed out and says so.

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
