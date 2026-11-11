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

### `login_events`

One row per login or sign-up attempt: `user_id` (null when the email is unknown), `email`, `ip`,
`user_agent`, `success`, `created_at`. Deleted with the user.

## Entitlement rules

- A user's effective plan is their own plan, or their host's plan when `host_id` is set.
- Included apps, storage, team size and free AppZone downloads per plan: `src/lib/plans.ts`
  (summarized in `docs/ROADMAP.md`).
- Only the host can permanently delete shared storage files (Phase 3).
- Prices live in the database and are managed by Admin (Phase 2), never in code.
