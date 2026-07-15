# Domain modules

Application code is organized **by domain** (constitution §"Code Organization"). Each business
domain lives in its own module here:

```
src/modules/<domain>/
  components/   # domain UI
  actions/      # server actions for this domain
  services/     # business logic / data access for this domain
  schema.ts     # Zod schemas / types
  <domain>.test.ts
```

Guidelines:

- **Default to domain modules.** Prefer `src/modules/<domain>/` over a purely layer-based layout.
- **Shared stays shared.** Cross-cutting code (UI primitives, `db`, `auth`, validation, helpers,
  app shell, routing) stays in `src/components`, `src/lib`, `src/server`, and `src/app` — do not
  duplicate it into modules.
- **Keep modules cohesive.** A module should encapsulate the full behavior of one domain.
