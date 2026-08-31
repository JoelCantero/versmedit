---
description: "Use when implementing Next.js route handlers, Server Actions, authentication endpoints, public mutations, or domain service boundaries. Covers validation, authorization, abuse controls, and HTTP responsibilities."
applyTo: "src/app/api/**,src/modules/**/actions/**"
---

# API and Server Actions

- Check the relevant Next.js 16 guide in `node_modules/next/dist/docs/` before relying on framework API knowledge.
- Keep handlers and actions at the transport boundary: parse input, authenticate and authorize, apply request-level controls, call domain services, and translate outcomes into HTTP responses, redirects, or action state.
- Put reusable business rules, state transitions, and persistence workflows in the owning `src/modules/<domain>` service. Do not copy direct Prisma access from legacy route exceptions unless framework integration makes it necessary.
- Validate every untrusted payload, path parameter, query parameter, locale, and callback destination with Zod or an existing domain parser before use.
- Derive identity, role, ownership, and authorization from the trusted server session and database. Never accept them from client input.
- For sensitive public or mutating routes, preserve the canonical-origin checks, CSRF protection, PostgreSQL-backed rate limits, provider availability checks, and non-enumerating responses used by neighboring routes.
- Keep API routes outside the `[locale]` segment. Use validated locale values only when selecting messages or constructing localized destinations.
- Server Actions start with `"use server"` and import `server-only`. Server-only route dependencies must also retain their server boundary.
- Do not expose secrets, raw provider failures, token hashes, account existence, internal exception text, or Prisma errors in public responses.
- Use `getRequestLogger` for request-scoped route events and the structured server logger for domain events. Log stable categories and sanitized metadata, never credentials or personal data.
- Preserve existing status codes, headers, timing defenses, redirects, and public result unions unless the feature specification explicitly changes the contract.
- Add focused route or action tests for validation failures, unauthenticated and unauthorized access, abuse controls, success, and safe failure behavior.