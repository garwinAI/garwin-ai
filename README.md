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
`npm run test:integration` and `npm run test:e2e` add test users to the database in `DATABASE_URL`,
so point it at a local or throwaway database, never production.

## Project layout

```
src/
  app/                 routes only
    (auth)/            login, signup
    (app)/             signed-in workspace (sidebar layout): assistant, messages, calendar,
                       apps, appzone, contacts, storage, settings/*, admin
    api/health/        public health check
  components/          shared UI (form, page header, logo, local time)
  components/shell/    responsive sidebar, navigation config
  components/assistant/ assistant chat + floating button
  lib/                 env, plans, apps, health, appzone-sandbox, auth/ (session, token, actions)
  db/schema.ts         Drizzle schema (all tables)
  db/                  client, migrate + seed scripts
  proxy.ts             route pre-check (Next 16's replacement for middleware)
  instrumentation.ts   validates env at server start
drizzle/               SQL migrations (generated; never edit by hand)
tests/unit/            Vitest, no database
tests/integration/     Vitest against DATABASE_URL
tests/e2e/             Playwright + axe accessibility checks
tests/support/         test helpers (fake email/SMS server)
docs/                  architecture, data model, roadmap
.github/               CI workflow, PR template, AI assistant instructions
```

## Configuration and secrets

- Every variable is declared in `src/lib/env.ts` and listed with placeholders in `.env.example`.
- Real values go in `.env` locally and in Vercel → Project → Settings → Environment Variables in production.
- `.env` files are git-ignored. Never commit secrets or paste them into AI chats.
- `APPZONE_SANDBOX_ORIGIN` is the separate domain that serves AppZone app files (e.g.
  `https://garwinapps.com`, never this app's own domain). Until it's set, AppZone apps can't launch.
  See "Apps and the shell" in `docs/ARCHITECTURE.md` for the sandbox rules.

## Deploy to dev.garwinai.com (Vercel)

1. vercel.com → **Add New → Project** → import `garwinAI/garwin-ai`, production branch `dev`.
2. Add environment variables: `DATABASE_URL` (the **pooled** connection string), `AUTH_SECRET` (a new
   value, not your local one), `APP_URL=https://dev.garwinai.com`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. Run `npm run db:migrate` and `npm run db:seed` once against that database.
4. Vercel → Settings → **Domains** → add `dev.garwinai.com`, and copy the CNAME target.
5. Namecheap → Domain List → garwinai.com → **Advanced DNS** → add **CNAME**, Host `dev`, Value = Vercel's target.
6. Check `https://dev.garwinai.com/api/health` returns `"status":"ok"`.

## Set up email (Resend)

Password reset and email verification are planned but not built yet (see `docs/ROADMAP.md`).
Set this up when that work starts.

1. Create an account at [resend.com](https://resend.com) → **Domains → Add domain** → `garwinai.com`.
2. Resend shows several DNS records (SPF/DKIM, usually TXT and MX). Add each one in Namecheap →
   Domain List → garwinai.com → **Advanced DNS** exactly as shown, then click **Verify** in Resend.
3. Resend → **API Keys → Create** (permission: *Sending access*, domain: garwinai.com).
4. In Vercel add `RESEND_API_KEY` (the key) and `EMAIL_FROM=Garwin AI <no-reply@garwinai.com>`.
   Never paste the key into code, chats or commits.

## Set up SMS invitations (Twilio)

Optional, and not built yet (see `docs/ROADMAP.md`). Without it, hosts will still be able to invite by email.

1. Create an account at [twilio.com](https://www.twilio.com) and buy a phone number with SMS.
2. For US recipients, complete **A2P 10DLC** registration (Messaging → Regulatory Compliance);
   unregistered US traffic gets blocked by carriers.
3. In Vercel add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (the number in
   `+1...` form, or a Messaging Service SID starting with `MG`). Never commit or share the token.

## Working with Copilot

Use Agent mode with one task at a time. Copilot automatically reads
`.github/copilot-instructions.md`. After each change: review the diff, run `npm run check`
(and `npm run test:e2e` for UI changes), then commit.
