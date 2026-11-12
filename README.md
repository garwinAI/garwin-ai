# Garwin AI

AI-powered workspace with an AppZone marketplace for apps, widgets and themes.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Postgres + Drizzle ORM · signed-cookie sessions (jose + bcrypt)

## Run it locally (Windows / macOS / Linux)

1. Install [Node.js 22+](https://nodejs.org) and have a Postgres database (a free [Neon](https://neon.tech) database works; no local install needed).
   With Docker installed, `docker compose up -d` starts a local one that matches the example `DATABASE_URL`.
2. Install packages:
   ```bash
   npm install
   ```
3. Copy `.env.example` to **both** `.env` and `.env.local`, then fill in `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Create the tables and your Admin account:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
5. Start it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## Deploy to dev.garwinai.com (Vercel)

1. On vercel.com: **Add New → Project → import `garwinAI/garwin-ai`**. Set the production branch to `main`.
2. Add environment variables: `DATABASE_URL`, `AUTH_SECRET` (32+ random characters, a new value, not your local one).
3. Run `npm run db:migrate` and `npm run db:seed` once against that database (from your computer with `.env` pointing at it).
4. In Vercel → Project → **Settings → Domains**, add `dev.garwinai.com`. Copy the CNAME target it shows.
5. In Namecheap → Domain List → garwinai.com → **Advanced DNS**, add **CNAME** · Host `dev` · Value = Vercel's target.

## Branches

- `main` is the live site. Only tested changes go here.
- `dev` is work in progress. Vercel builds a private preview link for every push to it.

To publish: merge `dev` into `main`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run check` | Lint + typecheck (run before every commit) |
| `npm run lint` / `npm run typecheck` | The two checks on their own |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Create / promote the Admin from `ADMIN_EMAIL` |

## Project layout

```
src/
  app/(auth)/        login, signup
  app/(app)/         signed-in workspace: assistant, messages, calendar, apps, appzone,
                     contacts, storage, settings/*, admin
  components/        shell (sidebar), assistant (chat + floating button), shared UI
  db/                Drizzle schema, migrate + seed scripts
  lib/auth/          sessions, server actions (sign up/in/out, password, profile)
  lib/plans.ts       plan limits from the spec (prices are Admin-controlled, Phase 2)
  lib/health.ts      Admin health rules (green / light green / yellow / red)
  proxy.ts           route gate (Next 16's replacement for middleware)
drizzle/             SQL migrations
```

## Build phases

1. ✅ **Foundation:** shell, design, navigation, floating Assistant, auth, roles, IP history, Admin health
2. Plans & billing: Admin-set prices, Stripe Checkout (monthly/yearly), idempotent signed webhooks
3. Core apps: Storage (shared quota, team permissions, mark-for-deletion), Calendar, Messages, Contacts
4. Workspace: drag/resize widgets and themes, Pages menu
5. AppZone: marketplace, download limits, developer applications, submissions, upload fees, 15% commission
6. Admin: members, support tickets, analytics, audited time-limited support access
7. Assistant: AI API integration

## Security rules (from the spec, non-negotiable)

- Never execute uploaded developer code on the main server. AppZone items run sandboxed on a separate origin.
- Stripe webhooks are the payment source of truth: verify signatures, process idempotently.
- Admin support access must be visible, reason-based, user-approved, time-limited, least-privilege and audited. No silent impersonation.
- Never commit secrets. `.env*` files are git-ignored.
