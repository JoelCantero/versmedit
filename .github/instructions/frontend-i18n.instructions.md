---
description: "Use when building React pages, layouts, components, forms, navigation, styling, or localized UI. Covers Next.js 16 boundaries, accessibility, next-intl, and client/server composition."
applyTo: "src/app/**/page.tsx,src/app/**/layout.tsx,src/components/**,src/modules/**/components/**,src/messages/**,src/i18n/**"
---

# Frontend and Internationalization

- Check the relevant Next.js 16 and React 19 guidance in `node_modules/next/dist/docs/` before changing framework behavior.
- Prefer Server Components. Add `"use client"` only to the smallest interactive boundary that needs state, effects, browser APIs, or event handlers.
- Client components must not import Prisma, `src/lib/db.ts`, secrets, Node-only modules, server-only services, or modules marked `server-only`.
- Server Components may call server-only domain services directly; do not add an internal HTTP request solely to reach the same application.
- Keep page files focused on route concerns, session checks, translations, data loading, and composition. Put reusable domain UI under `src/modules/<domain>/components` and shared primitives under `src/components`.
- Use the existing components in `src/components/ui` and Tailwind CSS 4 conventions before adding new primitives or styling abstractions.
- Keep user-visible copy in all three catalogs: `src/messages/en.json`, `src/messages/es.json`, and `src/messages/ca.json`. Do not hardcode UI text in components.
- Use `src/i18n/navigation.ts` helpers for application links and navigation. English is the unprefixed default locale; Spanish and Catalan use `/es` and `/ca`.
- Parse locale and callback destinations with existing domain helpers. Do not concatenate unvalidated client-provided paths into redirects.
- Preserve accessibility semantics: associated labels, keyboard operation, visible focus, meaningful headings, status announcements, and focus movement after validation errors.
- Keep client-side validation for immediate feedback, but treat server validation as authoritative. Render safe, stable public error states rather than internal errors.
- Add Testing Library coverage for interaction and accessibility behavior; add Playwright coverage for critical localized workflows or browser-only behavior.