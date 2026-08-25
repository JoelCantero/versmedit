import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";

import type {
  EmailLocale,
  EmailVariant,
  LocalizedEmailCopy,
} from "./types";

export const OPERATIONAL_EMAIL_VARIANTS = [
  "loginMagicLink",
  "signupActivation",
  "existingAccountSignupNotice",
  "accountDeletionReauthentication",
  "accountSecurityReauthentication",
  "personalDataExportConfirmation",
] as const satisfies readonly EmailVariant[];

export type OperationalEmailVariant =
  (typeof OPERATIONAL_EMAIL_VARIANTS)[number];

export const PREVIEW_ONLY_EMAIL_VARIANTS = [
  "personalDataExportReady",
  "accountDeleted",
  "emailChangeRequested",
  "emailChanged",
  "securityAlert",
  "genericConfirmation",
] as const satisfies readonly EmailVariant[];

export type PreviewOnlyEmailVariant =
  (typeof PREVIEW_ONLY_EMAIL_VARIANTS)[number];

type EmailCatalogue = Record<EmailVariant, LocalizedEmailCopy>;

const emailCatalogues = Object.freeze({
  en: enMessages.Email,
  es: esMessages.Email,
  ca: caMessages.Email,
}) satisfies Record<EmailLocale, EmailCatalogue>;

export function getLocalizedEmailCopy(
  locale: EmailLocale,
  variant: EmailVariant,
): unknown {
  return (emailCatalogues[locale] as Partial<Record<EmailVariant, unknown>>)[
    variant
  ];
}