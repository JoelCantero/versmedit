---
description: "Use when writing or updating Vitest, Testing Library, integration, Playwright, fixture, or performance tests. Covers test placement, isolation, real database boundaries, and quality gates."
applyTo: "tests/**,src/**/*.test.ts,src/**/*.test.tsx,vitest.config.ts,playwright.config.ts"
---

# Testing

- Put focused unit and component tests under `tests/unit/*.test.ts` or `tests/unit/*.test.tsx`, database-backed tests under `tests/integration/`, and browser journeys under `tests/e2e/*.spec.ts`.
- Use Vitest for units, services, route handlers, and integration tests; use Testing Library and `user-event` for component behavior; use Playwright for browser, CSP, routing, accessibility, and standalone-build behavior.
- Test observable behavior and public contracts. Avoid assertions against incidental implementation details unless they enforce a security or architecture boundary.
- Reuse existing fixtures and helpers. Keep test data deterministic, unique, minimal, and free of real personal data or credentials.
- Mock network providers at their established HTTP boundary. Tests must not send external email or depend on live third-party services.
- Use a real PostgreSQL database for behavior that depends on Prisma constraints, transactions, advisory locks, concurrency, or migration state. Do not replace those guarantees with an in-memory approximation.
- Preserve security invariants in tests: non-enumerating public results, canonical-origin enforcement, CSRF, authorization, rate limits, token expiry and purpose, safe redirects, and log redaction.
- For localized UI, cover English, Spanish, and Catalan when copy or routing changes. Prefer role- and label-based queries over CSS selectors or test IDs.
- Name regression tests after the behavior that failed. Ensure the test fails for the defect before relying on it as proof of the fix.
- Run the narrowest relevant test while iterating, for example `pnpm test -- tests/unit/<file>.test.ts`.
- Before completion, run `pnpm lint`, `pnpm typecheck`, and `pnpm test` when available. Use `pnpm test:coverage` for the enforced 80% statements, 75% branches, 80% functions, and 80% lines thresholds.
- Run `pnpm test:e2e` for critical user journeys, framework/security changes, or CI-equivalent validation. Tests under `emails/` use that application's own Playwright configuration and instructions.