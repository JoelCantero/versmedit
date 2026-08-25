import type {
  EmailBrand,
  EmailLocale,
  EmailPresentationRequest,
  EmailVariant,
} from "../../src/lib/email/presentation";

export const PREVIEW_BRAND: EmailBrand = Object.freeze({
  productName: "Versmedit",
  canonicalOrigin: "https://app.example.test",
  primaryColor: "#0057B8",
  actionForeground: "#FFFFFF",
  supportEmail: "support@example.test",
  logoUrl: null,
});

function actionUrl(path: string) {
  return new URL(path, "https://preview.example.test").toString();
}

function loginUrl(locale: EmailLocale) {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${PREVIEW_BRAND.canonicalOrigin}${prefix}/login`;
}

export function createPreviewRequest(
  variant: EmailVariant,
  locale: EmailLocale,
): EmailPresentationRequest {
  switch (variant) {
    case "loginMagicLink":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/login-magic-link"),
      });
    case "signupActivation":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/signup-activation"),
      });
    case "existingAccountSignupNotice":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: loginUrl(locale),
      });
    case "accountDeletionReauthentication":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/account-deletion"),
      });
    case "accountSecurityReauthentication":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/security-check"),
      });
    case "personalDataExportConfirmation":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/data-export-confirmation"),
      });
    case "personalDataExportReady":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/data-export-download"),
      });
    case "accountDeleted":
      return Object.freeze({ variant, locale, brand: PREVIEW_BRAND });
    case "emailChangeRequested":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/email-change"),
        newEmail: "future-address@example.test",
      });
    case "emailChanged":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        newEmail: "future-address@example.test",
      });
    case "securityAlert":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/security-review"),
        occurredAt: "2026-08-24T18:45:00.000Z",
      });
    case "genericConfirmation":
      return Object.freeze({
        variant,
        locale,
        brand: PREVIEW_BRAND,
        actionUrl: actionUrl("/actions/confirmation"),
        reference: "PREVIEW-CASE-2048",
      });
  }
}