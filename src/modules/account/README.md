# Account module

This module owns the localized authenticated account profile feature.

## Base UI and Avatar primitive

- The repository already includes `@base-ui/react`; no package installation is required.
- The profile avatar uses a local shadcn-compatible primitive in `src/components/ui/avatar.tsx`.

## Ownership and boundaries

- Domain behavior lives inside `src/modules/account`.
- Server-only profile reads and writes live in `service.ts` and `actions/update-profile.ts`.
- Client interactivity is isolated to `components/profile-form.tsx`.
- Shared routing and metadata composition stay in localized `src/app/[locale]` routes.

## Mutation scope and API constraints

- The only mutable profile attribute is `User.name`.
- The server derives identity only from the active Auth.js session.
- The mutation payload must contain only `name`; unknown or duplicate controls are rejected.
- This module does not expose a public API endpoint.
- Prisma schema, migrations, env vars, container topology, and email magic-link semantics remain unchanged.