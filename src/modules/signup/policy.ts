import { routing } from "@/i18n/routing";

export const TERMS_VERSION = "2026-08-18-draft";
export const PRIVACY_NOTICE_VERSION = "2026-08-18-draft";
export const POLICY_CONTENT_STATUS = "unreviewed-development-draft";

export const POLICY_PATHS = {
  terms: "/terms",
  privacy: "/privacy",
} as const;

export type PolicyLocale = (typeof routing.locales)[number];

function localizePolicyPath(locale: PolicyLocale, path: string) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export function getPolicyDestinations(locale: PolicyLocale) {
  return {
    terms: localizePolicyPath(locale, POLICY_PATHS.terms),
    privacy: localizePolicyPath(locale, POLICY_PATHS.privacy),
  } as const;
}