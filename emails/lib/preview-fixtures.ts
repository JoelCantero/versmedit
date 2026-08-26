import type {
  EmailLocale,
  EmailPresentationRequest,
  EmailVariant,
} from "../../src/lib/email/presentation";
import { validateEmailBrand } from "../../src/lib/email/presentation";

const fictionalPreviewBrand = validateEmailBrand({
  productName: "Versmedit",
  canonicalOrigin: "https://app.example.test",
  primaryColor: "#0057B8",
  supportEmail: "support@example.test",
  logoUrl: null,
});

const previewBrandFields = [
  "EMAIL_PREVIEW_PROJECT_NAME",
  "EMAIL_PREVIEW_BRAND_COLOR",
  "EMAIL_PREVIEW_SUPPORT_EMAIL",
  "EMAIL_PREVIEW_LOGO_URL",
] as const;

export function createPreviewBrand(
  envSource: Readonly<Record<string, string | undefined>>,
) {
  if (!previewBrandFields.some((field) => envSource[field]?.trim())) {
    return fictionalPreviewBrand;
  }

  return validateEmailBrand({
    productName:
      envSource.EMAIL_PREVIEW_PROJECT_NAME ?? fictionalPreviewBrand.productName,
    canonicalOrigin: fictionalPreviewBrand.canonicalOrigin,
    primaryColor:
      envSource.EMAIL_PREVIEW_BRAND_COLOR ?? fictionalPreviewBrand.primaryColor,
    supportEmail:
      envSource.EMAIL_PREVIEW_SUPPORT_EMAIL ??
      fictionalPreviewBrand.supportEmail,
    logoUrl: envSource.EMAIL_PREVIEW_LOGO_URL || null,
  });
}

export const PREVIEW_BRAND = createPreviewBrand({
  EMAIL_PREVIEW_PROJECT_NAME: process.env.EMAIL_PREVIEW_PROJECT_NAME,
  EMAIL_PREVIEW_BRAND_COLOR: process.env.EMAIL_PREVIEW_BRAND_COLOR,
  EMAIL_PREVIEW_SUPPORT_EMAIL: process.env.EMAIL_PREVIEW_SUPPORT_EMAIL,
  EMAIL_PREVIEW_LOGO_URL: process.env.EMAIL_PREVIEW_LOGO_URL,
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