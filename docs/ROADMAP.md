# Roadmap

> Rebuilt on 2026-11-11 from the phase markers in the code (`<ComingSoon phase={n} />`, code
> comments and the Admin tools list). The original roadmap file was never uploaded to GitHub.
> Phase 4 has no marker in the code yet. Add its scope and any missing detail here.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | App shell: landing page, sign up / log in / log out, sessions, roles (member, admin), sidebar workspace, Settings (profile, password, log out everywhere, IP history), Admin overview + system health | **Done** |
| 2 | Billing: plans and prices managed by Admin, Stripe checkout, plan switching, saved cards, invoices, Stripe settings | **Done** (needs Stripe keys, see README) |
| 3 | Core apps: Storage, Calendar, Messages, Contacts | Not started (pages are placeholders) |
| 4 | _To be filled in_ | Unknown |
| 5 | AppZone marketplace: apps/widgets/themes from the database, developer applications and approval, sandboxed app launch (`/apps/:slug/open`) | Not started |
| 6 | Members admin, support tickets, analytics, two-factor authentication | Not started |
| 7 | Assistant connected to Claude via `ASSISTANT_API_KEY` (UI already built, replies are stubbed) | Not started |

## Not built yet but described in the README / config

These were in the README or test config but have no code in the repository yet:

- Email verification and password reset emails (Resend)
- SMS team invitations (Twilio)
- Team members joining a host's plan (`users.host_id` exists in the schema; no invite flow yet)
- Rate limiting for sign-up (login already locks out after 8 failures in 15 minutes per email or IP)

## Plans (from `src/lib/plans.ts`)

| Plan | Storage | Team members | AppZone downloads | Apps |
| --- | --- | --- | --- | --- |
| Free | 1 GB | 0 | 10 | Assistant, Storage, Calendar, Messages, Contacts |
| Starter | 20 GB | 1 | Unlimited | + Wordbase, Codebase, Spreadsheets |
| Plus | 50 GB | 3 | Unlimited | same as Starter |
| Pro | 100 GB | 10 | Unlimited | same as Starter |

Prices are set by Admin in Admin → Billing, never hard-coded.

## Billing follow-ups (not built yet)

- Downgrades don't yet remove extra team members or files beyond the new plan's limits (needs
  Phase 3 storage and team invites).
- Taxes (Stripe Tax) and coupons beyond Stripe promotion codes.
- Yearly prices aren't required: a plan with only a monthly price simply has no yearly option.
