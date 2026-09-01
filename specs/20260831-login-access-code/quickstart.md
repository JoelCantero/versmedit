# Quickstart: Login Access Code

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-31

Runnable validation for the feature. Details live in [data-model.md](./data-model.md) and
[contracts/](./contracts); this file only says how to prove the behavior works.

## Prerequisites

- Node.js 24 LTS and pnpm (`packageManager` in `package.json` pins the version).
- Docker running, for the development PostgreSQL container.
- A local `.env` derived from `.env.example`, including `AUTH_SECRET`/`NEXTAUTH_SECRET`, `NEXTAUTH_URL`
  and the `MAIL_*` values. No new variable is required by this feature.

## Setup

```bash
pnpm install
docker compose up -d --wait db
pnpm db:migrate          # applies the additive login-code migration
pnpm db:generate
```

Seed an active account to log in with:

```bash
NODE_ENV=development node prisma/seed.mjs
```

## Run

```bash
pnpm dev                 # app on http://localhost:3000
pnpm email:dev           # optional: email preview on http://127.0.0.1:3001
```

## Manual validation scenarios

Each scenario maps to acceptance criteria in [spec.md](./spec.md).

1. **Confirmation screen replaces the form** (US2). Open `/login`, submit a seeded address. The form
   is replaced by "Check your email" showing the brand, the entered address, "Enter code manually" and
   "Back to login". The URL must still be `/login` with no query string, and the browser must not have
   gained a history entry.
2. **Code sign-in** (US1). Read the code from the delivered email (or the mail transport log in
   development), choose "Enter code manually", paste it in lower case with a hyphen in the middle, and
   submit. A session is created and the browser lands on the validated destination.
3. **Link and code share one challenge** (US1). Request access, redeem the magic link, then submit the
   code from the same email — it must be refused with the generic error. Repeat in the opposite order.
4. **Replacement** (US1). Request access twice, then submit the code from the first email — refused.
5. **Attempt budget**. Request access, submit five wrong codes, then submit the correct one — refused,
   with the same message throughout. Requesting a new email restores a working code.
6. **Unknown address** (US2). Submit an address with no account. The response, the screen and the
   perceived delay must be indistinguishable from step 1, and no email is sent.
7. **Reload and back** . On the confirmation or code step, reload the page — the email form returns.
   Press Back — the login page is left entirely; no broken or half-filled form appears.
8. **Localization** (US3). Repeat steps 1 and 2 at `/es/login` and `/ca/login` and confirm the screens
   and the email are fully localized, and that the email states 5 minutes in every language.
9. **Expiry**. Request access, wait more than 5 minutes, then try both the link and the code — both
   refused with the generic error.
10. **Accessibility**. Complete the whole flow with the keyboard only. Focus must land on each new
    step's heading, errors must be announced, and the layout must not shift at 320px width.

## Automated verification

```bash
pnpm lint
pnpm typecheck
pnpm test                     # unit + integration
pnpm test:coverage            # enforces the configured thresholds
pnpm test:e2e                 # three login screens + one complete code sign-in
pnpm build                    # production build
```

Coverage expectations for this feature, per the clarified verification split:

- **Unit**: code alphabet and generation, normalization rules, keyed hashing and constant-time
  comparison, the three-step UI state machine, focus management and accessibility, and the new route's
  branch handling.
- **Integration** (real database): issuance writes a code hash on the same row as the link; single use
  across both methods; shared 5-minute expiry; replacement by a newer request; concurrent redemption
  creating at most one session; attempt budget deleting the challenge on the fifth failure; client and
  address throttling; uniform generic failures; delivery failure leaving no usable challenge.
- **E2E**: the confirmation and code screens, and one complete code sign-in reading the code from the
  mail transport already used in end-to-end runs.

## Rollback

The feature is additive. To revert:

1. Deploy the previous application image — the magic link path is unchanged and keeps working.
2. Apply the corrective forward migration dropping `loginCodeHash` and `loginCodeAttempts`.

No data is rewritten, so no restore from backup is required. In-flight challenges expire within
5 minutes.
