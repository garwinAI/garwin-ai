# Garwin AI

AI-powered workspace with an AppZone marketplace for apps, widgets and themes.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Drizzle ORM · Vitest + Playwright · npm

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Spec and roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)
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
| `npm run test:e2e` | Browser tests (Playwright); needs the database and `db:seed` |
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
  components/          UI: shell (sidebar), assistant (chat + floating button), shared pieces
  server/services/     ALL database access (users, login events, entitlements, admin stats)
  lib/                 env, logger, errors, validation, actions, plans, entitlements, health, auth/
  db/                  Drizzle schema, client, migrate + seed scripts
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

## Deploy to dev.garwinai.com (Vercel)

1. vercel.com → **Add New → Project** → import `garwinAI/garwin-ai`, production branch `dev`.
2. Add environment variables: `DATABASE_URL` (the **pooled** connection string), `AUTH_SECRET` (a new
   value, not your local one), `APP_URL=https://dev.garwinai.com`.
3. Run `npm run db:migrate` and `npm run db:seed` once against that database.
4. Vercel → Settings → **Domains** → add `dev.garwinai.com`, and copy the CNAME target.
5. Namecheap → Domain List → garwinai.com → **Advanced DNS** → add **CNAME**, Host `dev`, Value = Vercel's target.
6. Check `https://dev.garwinai.com/api/health` returns `"status":"ok"`.

## Working with Copilot

Use Agent mode with one task at a time. Copilot automatically reads
`.github/copilot-instructions.md`. After each change: review the diff, run `npm run check`
(and `npm run test:e2e` for UI changes), then commit.
