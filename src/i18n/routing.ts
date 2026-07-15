import { defineRouting } from "next-intl/routing";

// Multilingual routing (constitution → Internationalization).
// English is the default and is served WITHOUT a URL prefix; Spanish and
// Catalan are prefixed: `/dashboard` (en), `/es/dashboard`, `/ca/dashboard`.
export const routing = defineRouting({
  locales: ["en", "es", "ca"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
