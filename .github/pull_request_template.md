## What and why

<!-- One or two sentences. Link the phase/task. -->

## How it was tested

- [ ] `npm run check` passes (lint, typecheck, unit tests)
- [ ] `npm run test:e2e` passes (if UI or auth changed)
- [ ] New/changed behavior has tests

## Checklist

- [ ] No secrets, real keys or customer data in code, tests or commits
- [ ] DB access only in `src/server/services/`; schema change has a generated migration
- [ ] Inputs validated with zod; pages/actions call `requireUser()` / `requireAdmin()`
- [ ] Plan checks use `getEntitlements()`, not `user.plan`
- [ ] Docs / `.env.example` updated if commands or env vars changed
