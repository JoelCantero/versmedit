import { render } from "@react-email/render";
import { z } from "zod";

import {
  EmailBrandValidationError,
  validateEmailBrand,
} from "./brand";
import { getLocalizedEmailCopy } from "./catalog";
import {
  EMAIL_LOCALES,
  EMAIL_PREVIEW_HOSTS,
  EMAIL_VARIANT_DEFINITIONS,
  EMAIL_VARIANTS,
} from "./constants";
import { isLoginCode } from "@/modules/login/code";
import { EmailDocument } from "./components/email-document";
import { composeAccountDeletionReauthenticationBody } from "./templates/account-deletion-reauthentication";
import { composeAccountDeletedBody } from "./templates/account-deleted";
import { composeAccountSecurityReauthenticationBody } from "./templates/account-security-reauthentication";
import { composeEmailChangedBody } from "./templates/email-changed";
import { composeEmailChangeRequestedBody } from "./templates/email-change-requested";
import { composeExistingAccountSignupNoticeBody } from "./templates/existing-account-signup-notice";
import { composeGenericConfirmationBody } from "./templates/generic-confirmation";
import { composeLoginMagicLinkBody } from "./templates/login-magic-link";
import { composePersonalDataExportConfirmationBody } from "./templates/personal-data-export-confirmation";
import { composePersonalDataExportReadyBody } from "./templates/personal-data-export-ready";
import { composeSecurityAlertBody } from "./templates/security-alert";
import { composeSignupActivationBody } from "./templates/signup-activation";
import type {
  ActionLocalizedEmailCopy,
  EmailBrand,
  EmailLocale,
  EmailPresentationErrorCode,
  EmailPresentationRequest,
  EmailVariant,
  LocalizedEmailCopy,
  RenderedEmailContent,
} from "./types";

const BASE_REQUEST_KEYS = ["variant", "locale", "brand"] as const;
const BRAND_KEYS = [
  "productName",
  "canonicalOrigin",
  "primaryColor",
  "actionForeground",
  "supportEmail",
  "logoUrl",
] as const;
const BASE_COPY_KEYS = [
  "subject",
  "previewText",
  "heading",
  "paragraphs",
  "supportLabel",
  "termsLabel",
  "privacyLabel",
  "legalLabel",
] as const;
const ACTION_COPY_KEYS = ["actionLabel", "fallbackInstruction"] as const;
const KNOWN_FORBIDDEN_REQUEST_FIELDS = new Set([
  "actionUrl",
  "subject",
  "previewText",
  "heading",
  "paragraphs",
  "actionLabel",
  "fallbackInstruction",
  "html",
  "text",
  "recipient",
]);
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
const ASCII_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

export class EmailPresentationError extends Error {
  readonly code: EmailPresentationErrorCode;
  readonly field?: string;

  constructor(code: EmailPresentationErrorCode, field?: string) {
    super(
      field
        ? `Email presentation failed: ${code} (${field})`
        : `Email presentation failed: ${code}`,
    );
    this.name = "EmailPresentationError";
    this.code = code;
    this.field = field;
  }
}

function presentationError(
  code: EmailPresentationErrorCode,
  field?: string,
): never {
  throw new EmailPresentationError(code, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmailLocale(value: unknown): value is EmailLocale {
  return (
    typeof value === "string" &&
    (EMAIL_LOCALES as readonly string[]).includes(value)
  );
}

function isEmailVariant(value: unknown): value is EmailVariant {
  return (
    typeof value === "string" &&
    (EMAIL_VARIANTS as readonly string[]).includes(value)
  );
}

function isFictionalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    (EMAIL_PREVIEW_HOSTS as readonly string[]).includes(normalized) ||
    normalized.endsWith(".test")
  );
}

function validateActionUrl(
  value: unknown,
  variant: EmailVariant,
  locale: EmailLocale,
  brand: EmailBrand,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    presentationError("INVALID_INPUT", "actionUrl");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    presentationError("INVALID_INPUT", "actionUrl");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    presentationError("INVALID_INPUT", "actionUrl");
  }

  const definition = EMAIL_VARIANT_DEFINITIONS[variant];
  if (
    definition.classification === "preview-only" &&
    !isFictionalHost(url.hostname)
  ) {
    presentationError("INVALID_INPUT", "actionUrl");
  }

  if (variant === "existingAccountSignupNotice") {
    const localePrefix = locale === "en" ? "" : `/${locale}`;
    const expected = `${brand.canonicalOrigin}${localePrefix}/login`;
    if (value !== expected) {
      presentationError("INVALID_INPUT", "actionUrl");
    }
  }

  return value;
}

function validateNewEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > 320 ||
    !z.email().safeParse(value).success
  ) {
    presentationError("INVALID_INPUT", "newEmail");
  }

  const hostname = value.slice(value.lastIndexOf("@") + 1);
  if (!isFictionalHost(hostname)) {
    presentationError("INVALID_INPUT", "newEmail");
  }

  return value;
}

function validateOccurredAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    presentationError("INVALID_INPUT", "occurredAt");
  }

  return value;
}

function validateReference(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > 80 ||
    ASCII_CONTROL_PATTERN.test(value)
  ) {
    presentationError("INVALID_INPUT", "reference");
  }

  return value;
}

function validateVerificationCode(value: unknown): string {
  if (typeof value !== "string" || !isLoginCode(value)) {
    presentationError("INVALID_INPUT", "verificationCode");
  }

  return value;
}

function validateNormalizedBrand(value: unknown): EmailBrand {
  if (!isRecord(value)) {
    presentationError("INVALID_BRAND", "brand");
  }

  const keys = Object.keys(value);
  if (
    keys.length !== BRAND_KEYS.length ||
    keys.some((key) => !(BRAND_KEYS as readonly string[]).includes(key))
  ) {
    presentationError("INVALID_BRAND", "brand");
  }

  let normalized: EmailBrand;
  try {
    normalized = validateEmailBrand({
      productName: value.productName,
      canonicalOrigin: value.canonicalOrigin,
      primaryColor: value.primaryColor,
      supportEmail: value.supportEmail,
      logoUrl: value.logoUrl,
    });
  } catch (error) {
    if (error instanceof EmailBrandValidationError) {
      const field = error.field === "brand" ? "brand" : `brand.${error.field}`;
      presentationError("INVALID_BRAND", field);
    }
    presentationError("INVALID_BRAND", "brand");
  }

  for (const key of BRAND_KEYS) {
    if (value[key] !== normalized[key]) {
      presentationError("INVALID_BRAND", `brand.${key}`);
    }
  }

  return normalized;
}

export function validateEmailPresentationRequest(
  input: unknown,
): EmailPresentationRequest {
  if (!isRecord(input)) presentationError("INVALID_INPUT", "request");
  if (!isEmailVariant(input.variant)) {
    presentationError("INVALID_INPUT", "variant");
  }
  if (!isEmailLocale(input.locale)) {
    presentationError("INVALID_INPUT", "locale");
  }

  const variant = input.variant;
  const locale = input.locale;
  const definition = EMAIL_VARIANT_DEFINITIONS[variant];
  const expectedKeys = new Set<string>([
    ...BASE_REQUEST_KEYS,
    ...definition.valueKeys,
  ]);
  for (const key of Object.keys(input)) {
    if (!expectedKeys.has(key)) {
      presentationError(
        "INVALID_INPUT",
        KNOWN_FORBIDDEN_REQUEST_FIELDS.has(key) ? key : "request",
      );
    }
  }
  for (const key of expectedKeys) {
    if (!(key in input)) presentationError("INVALID_INPUT", key);
  }

  const brand = validateNormalizedBrand(input.brand);
  const result: Record<string, unknown> = { variant, locale, brand };
  for (const key of definition.valueKeys) {
    if (key === "actionUrl") {
      result.actionUrl = validateActionUrl(
        input.actionUrl,
        variant,
        locale,
        brand,
      );
    } else if (key === "newEmail") {
      result.newEmail = validateNewEmail(input.newEmail);
    } else if (key === "occurredAt") {
      result.occurredAt = validateOccurredAt(input.occurredAt);
    } else if (key === "reference") {
      result.reference = validateReference(input.reference);
    } else if (key === "verificationCode") {
      result.verificationCode = validateVerificationCode(
        input.verificationCode,
      );
    }
  }

  return Object.freeze(result) as EmailPresentationRequest;
}

function validatedCopyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    presentationError("INVALID_CATALOGUE", field);
  }

  const normalized = value.trim();
  if (normalized.length === 0 || ASCII_CONTROL_PATTERN.test(normalized)) {
    presentationError("INVALID_CATALOGUE", field);
  }

  return normalized;
}

export function validateLocalizedEmailCopy(
  input: unknown,
  hasAction: boolean,
): LocalizedEmailCopy {
  if (!isRecord(input)) presentationError("INVALID_CATALOGUE", "copy");

  const expectedKeys = new Set<string>([
    ...BASE_COPY_KEYS,
    ...(hasAction ? ACTION_COPY_KEYS : []),
  ]);
  const inputKeys = Object.keys(input);
  if (
    inputKeys.length !== expectedKeys.size ||
    inputKeys.some((key) => !expectedKeys.has(key))
  ) {
    presentationError("INVALID_CATALOGUE", "copy");
  }

  if (!Array.isArray(input.paragraphs) || input.paragraphs.length === 0) {
    presentationError("INVALID_CATALOGUE", "copy.paragraphs");
  }
  const paragraphs = Object.freeze(
    input.paragraphs.map((paragraph, index) =>
      validatedCopyString(paragraph, `copy.paragraphs.${index}`),
    ),
  );

  const baseCopy = {
    subject: validatedCopyString(input.subject, "copy.subject"),
    previewText: validatedCopyString(input.previewText, "copy.previewText"),
    heading: validatedCopyString(input.heading, "copy.heading"),
    paragraphs,
    supportLabel: validatedCopyString(input.supportLabel, "copy.supportLabel"),
    termsLabel: validatedCopyString(input.termsLabel, "copy.termsLabel"),
    privacyLabel: validatedCopyString(input.privacyLabel, "copy.privacyLabel"),
    legalLabel: validatedCopyString(input.legalLabel, "copy.legalLabel"),
  };

  if (!hasAction) return Object.freeze(baseCopy);
  return Object.freeze({
    ...baseCopy,
    actionLabel: validatedCopyString(input.actionLabel, "copy.actionLabel"),
    fallbackInstruction: validatedCopyString(
      input.fallbackInstruction,
      "copy.fallbackInstruction",
    ),
  });
}

function resolveCopyValue(
  value: string,
  field: string,
  placeholders: Readonly<Record<string, string>>,
): string {
  const resolved = value.replace(
    PLACEHOLDER_PATTERN,
    (_placeholder, key: string) => {
      const replacement = placeholders[key];
      if (replacement === undefined) {
        presentationError("INVALID_CATALOGUE", field);
      }
      return replacement;
    },
  );

  if (/[{}]/u.test(resolved)) {
    presentationError("INVALID_CATALOGUE", field);
  }

  return resolved;
}

function isActionLocalizedEmailCopy(
  copy: LocalizedEmailCopy,
): copy is ActionLocalizedEmailCopy {
  return (
    typeof copy.actionLabel === "string" &&
    typeof copy.fallbackInstruction === "string"
  );
}

function resolveCopy(
  request: EmailPresentationRequest,
  copy: LocalizedEmailCopy,
): LocalizedEmailCopy {
  const requestValues = request as unknown as Record<string, unknown>;
  const placeholders: Record<string, string> = {
    productName: request.brand.productName,
    supportEmail: request.brand.supportEmail,
  };
  for (const key of EMAIL_VARIANT_DEFINITIONS[request.variant].valueKeys) {
    const value = requestValues[key];
    if (typeof value === "string" && key !== "actionUrl") {
      placeholders[key] =
        key === "occurredAt"
          ? new Intl.DateTimeFormat(request.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            }).format(new Date(value))
          : value;
    }
  }

  const resolvedBase = {
    subject: resolveCopyValue(copy.subject, "copy.subject", placeholders),
    previewText: resolveCopyValue(
      copy.previewText,
      "copy.previewText",
      placeholders,
    ),
    heading: resolveCopyValue(copy.heading, "copy.heading", placeholders),
    paragraphs: Object.freeze(
      copy.paragraphs.map((paragraph, index) =>
        resolveCopyValue(
          paragraph,
          `copy.paragraphs.${index}`,
          placeholders,
        ),
      ),
    ),
    supportLabel: resolveCopyValue(
      copy.supportLabel,
      "copy.supportLabel",
      placeholders,
    ),
    termsLabel: resolveCopyValue(
      copy.termsLabel,
      "copy.termsLabel",
      placeholders,
    ),
    privacyLabel: resolveCopyValue(
      copy.privacyLabel,
      "copy.privacyLabel",
      placeholders,
    ),
    legalLabel: resolveCopyValue(
      copy.legalLabel,
      "copy.legalLabel",
      placeholders,
    ),
  };

  if (!isActionLocalizedEmailCopy(copy)) return Object.freeze(resolvedBase);
  return Object.freeze({
    ...resolvedBase,
    actionLabel: resolveCopyValue(
      copy.actionLabel,
      "copy.actionLabel",
      placeholders,
    ),
    fallbackInstruction: resolveCopyValue(
      copy.fallbackInstruction,
      "copy.fallbackInstruction",
      placeholders,
    ),
  });
}

export async function renderResolvedEmailContent(
  input: unknown,
  localizedCopy: unknown,
): Promise<RenderedEmailContent> {
  const request = validateEmailPresentationRequest(input);
  const definition = EMAIL_VARIANT_DEFINITIONS[request.variant];
  const hasAction = definition.actionMode !== "none";
  const copy = resolveCopy(
    request,
    validateLocalizedEmailCopy(localizedCopy, hasAction),
  );
  const requestValues = request as unknown as Record<string, unknown>;

  const document = (
    <EmailDocument
      locale={request.locale}
      brand={request.brand}
      previewText={copy.previewText}
      heading={copy.heading}
      paragraphs={copy.paragraphs}
      supportLabel={copy.supportLabel}
      termsLabel={copy.termsLabel}
      privacyLabel={copy.privacyLabel}
      legalLabel={copy.legalLabel}
      action={
        hasAction && isActionLocalizedEmailCopy(copy)
          ? {
              actionUrl: requestValues.actionUrl as string,
              label: copy.actionLabel,
              fallbackInstruction: copy.fallbackInstruction,
              code:
                typeof requestValues.verificationCode === "string"
                  ? requestValues.verificationCode
                  : undefined,
            }
          : undefined
      }
    />
  );

  try {
    const [html, text] = await Promise.all([
      render(document),
      render(document, {
        plainText: true,
        htmlToTextOptions: {
          selectors: [
            {
              selector: "[data-primary-action=true]",
              format: "anchor",
              options: { ignoreHref: true },
            },
          ],
        },
      }),
    ]);

    if (
      html.trim() === "" ||
      text.trim() === "" ||
      /<script\b/iu.test(html) ||
      html.includes("undefined") ||
      text.includes("undefined") ||
      /\{[^}]+\}/u.test(html) ||
      /\{[^}]+\}/u.test(text)
    ) {
      presentationError("RENDER_FAILED");
    }

    return Object.freeze({ subject: copy.subject, html, text });
  } catch (error) {
    if (error instanceof EmailPresentationError) throw error;
    presentationError("RENDER_FAILED");
  }
}

export async function renderEmailPresentation(
  input: unknown,
): Promise<RenderedEmailContent> {
  const request = validateEmailPresentationRequest(input);
  const localizedCopyInput = getLocalizedEmailCopy(
    request.locale,
    request.variant,
  );
  if (localizedCopyInput === undefined) {
    presentationError("INVALID_CATALOGUE", "variant");
  }
  const localizedCopy = validateLocalizedEmailCopy(
    localizedCopyInput,
    EMAIL_VARIANT_DEFINITIONS[request.variant].actionMode !== "none",
  );

  switch (request.variant) {
    case "loginMagicLink": {
      const composition = composeLoginMagicLinkBody(request, localizedCopy);
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "signupActivation": {
      const composition = composeSignupActivationBody(request, localizedCopy);
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "existingAccountSignupNotice": {
      const composition = composeExistingAccountSignupNoticeBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "accountDeletionReauthentication": {
      const composition = composeAccountDeletionReauthenticationBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "accountSecurityReauthentication": {
      const composition = composeAccountSecurityReauthenticationBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "personalDataExportConfirmation": {
      const composition = composePersonalDataExportConfirmationBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "personalDataExportReady": {
      const composition = composePersonalDataExportReadyBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "accountDeleted": {
      const composition = composeAccountDeletedBody(request, localizedCopy);
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "emailChangeRequested": {
      const composition = composeEmailChangeRequestedBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "emailChanged": {
      const composition = composeEmailChangedBody(request, localizedCopy);
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "securityAlert": {
      const composition = composeSecurityAlertBody(request, localizedCopy);
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    case "genericConfirmation": {
      const composition = composeGenericConfirmationBody(
        request,
        localizedCopy,
      );
      return renderResolvedEmailContent(
        composition.request,
        composition.localizedCopy,
      );
    }
    default:
      return presentationError("INVALID_CATALOGUE", "variant");
  }
}
