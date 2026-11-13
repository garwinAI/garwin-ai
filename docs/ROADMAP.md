# Product spec and roadmap

## Product requirements (source of truth)

- AI-powered CMS/workspace with an **AppZone** marketplace for apps/plugins, widgets and themes.
- Design: grayscale, blue buttons, orange accents, narrow collapsible left sidebar, Garwin AI logo/name.
- Navigation: Assistant, Messages, Calendar, Apps, Go to AppZone, Contacts, Storage, Settings, Log Out.
- Settings: General, Payments, Cards, Apps (individual settings/deactivate/go), Security, Passwords, IP History.
- Assistant always reachable through a persistent floating button.
- **Free:** 1 GB; up to 10 free AppZone downloads; Assistant, Storage, Calendar, Messages, Contacts; 0 team members.
- **Starter:** 20 GB; unlimited eligible AppZone downloads; Free + Wordbase, Codebase, Spreadsheets; 1 team member.
- **Plus:** 50 GB; everything in Starter; 3 team members.
- **Pro:** 100 GB; everything in Starter; 10 team members.
- Paid plans bill monthly or yearly. Admin controls prices.
- Host and team share storage. Host sets each team member's permissions. Team members can mark items
  for deletion but cannot permanently delete.
- Host/team messaging, Admin/support messaging, notifications, support tickets.
- App pages: large image on the right, title/details, GO button opening the app.
- Workspace widgets/themes can be dragged, moved, resized, customized. Pages menu: add, remove,
  duplicate, delete, reorder tabs.
- Developers apply; Admin approves/denies. Approved developers submit items and set prices.
- 15% commission on eligible marketplace sales. One-time upload fees: app $39.99, theme $29.99, widget $19.99.
- Admin manages members, plans, prices, apps, marketplace, developer applications, support,
  Assistant API, Stripe settings, analytics, system health.
- Health: Green = online; Light green = online with payments unconfigured or tickets > 24h;
  Yellow = tickets > 48h, Assistant not configured, or significant issue; Red = offline/critical.
  Critical overrides lower levels.
- Admin support access: visible, time-limited, reason-based, explicitly approved, least-privilege,
  audited. Never silent impersonation.
- Never execute uploaded developer code on the main server; sandboxed extension architecture.
- Stripe webhooks are the payment source of truth: verify signatures, idempotent processing.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Shell, design, navigation, floating Assistant UI, auth, roles, IP history, Admin health | ✅ Done |
| 1a | Foundation: env, logging, errors, validation, services, tests, CI, docs, AI instructions | ✅ Done |
| 1b | Responsive shell, accessible UI components, real app activation + app settings, no faked data | ✅ Done |
| 1.5 | Auth: DB sessions, password reset, email verification (Resend), rate limiting, CSRF checks, device management, activity history | ✅ Done |
| 1.5b | Data model: accounts/teams/permissions/invitations, plans/prices/subscriptions/payments, storage, AppZone, messaging, support, audit; central entitlement service | ✅ Done |
| 3a | Teams: email/SMS invitations, permissions, workspace switching, shared storage folders with mark-for-deletion, host/team messaging | ✅ Done |
| 1.6 | Deploy to dev.garwinai.com (Vercel + Neon + Resend), CSP header, data retention jobs | Next |
| 2 | Billing: Admin-set prices, Stripe Checkout (monthly/yearly), in-app plan switching, customer portal, signed idempotent webhooks, payments ledger | ✅ Done (needs Stripe keys: README) |
| 3 | Core apps: Storage (R2, shared quota, permissions, mark-for-deletion), Calendar, Contacts, Messages, notifications, teams | |
| 4 | Workspace: draggable/resizable widgets, themes, Pages menu | |
| 5 | AppZone: marketplace, download limits, developer applications, sandbox origin, upload fees, Stripe Connect commission | |
| 6 | Admin: members, support tickets, audited support access, analytics, real health checks | Partly done: members list and statuses, remote view (user-approved), Console, health and ticket-age widgets. Support ticket screens and analytics next. |
| 7 | Assistant: AI provider integration | |

## Open decisions (owner)

- Hosting: Vercel + Neon (Postgres) + Cloudflare R2 proposed; not yet confirmed. Email: **Resend (confirmed)**.
- Separate domain for sandboxed AppZone items (e.g. `garwinapps.com`).
- Free download limit: **lifetime** (confirmed). Eligible = free-priced items (confirmed). Free accounts may buy paid items (assumed).
- What happens when someone who already has a workspace accepts a team invitation (Phase 3).
- Whether Wordbase/Codebase/Spreadsheets are full apps in v1.
