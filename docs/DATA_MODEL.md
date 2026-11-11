# Data model

Schema: `src/db/schema.ts`. Migrations: `drizzle/` (generated with `npm run db:generate`; never
edit by hand).

## Tables

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `email` | text | unique, stored lower-case |
| `name` | text | |
| `password_hash` | text | bcrypt; never sent to the browser |
| `role` | `member` \| `admin` | default `member` |
| `plan` | `free` \| `starter` \| `plus` \| `pro` | default `free` |
| `host_id` | uuid → users.id | set for team members; they share the host's plan and storage. Deleting the host deletes them |
| `developer_status` | `none` \| `pending` \| `approved` \| `denied` | AppZone developer application |
| `session_version` | integer | bump to sign the user out everywhere |
| `created_at`, `updated_at` | timestamptz | |

Also: `stripe_customer_id` (unique), set the first time the user opens checkout or the billing portal.

### `plan_prices`

One row per paid plan and interval (`month` / `year`): `amount_cents`, `currency` (`usd`),
`stripe_product_id`, `stripe_price_id` (null until created in Stripe). Stripe prices can't be
edited, so a change creates a new Stripe price and archives the old one; existing subscribers keep
the price they signed up with.

### `subscriptions`

At most one per user (`user_id` is the key): Stripe subscription and customer ids, current
`stripe_price_id`, `plan`, `interval`, Stripe `status`, `current_period_end`,
`cancel_at_period_end`. Written only by the billing service from data read back from Stripe.

### `stripe_events`

Ids of webhook events already handled, so Stripe's retries are applied once.

### `login_events`

One row per login or sign-up attempt: `user_id` (null when the email is unknown), `email`, `ip`,
`user_agent`, `success`, `created_at`. Deleted with the user.

## Entitlement rules

- A user's effective plan is their own plan, or their host's plan when `host_id` is set.
- Included apps, storage, team size and free AppZone downloads per plan: `src/lib/plans.ts`
  (summarized in `docs/ROADMAP.md`).
- Only the host can permanently delete shared storage files (Phase 3).
- Prices live in the database and are managed by Admin, never in code.
- `users.plan` follows the subscription: the paid plan while Stripe says `active`, `trialing` or
  `past_due` (Stripe is retrying a failed card), otherwise `free`. See `entitledPlan()` in
  `src/lib/billing.ts`.
- Team members (`host_id` set) can't buy plans; their host pays.
