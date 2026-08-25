import { z } from "zod";

import type { EmailBrand } from "./types";

const BRAND_INPUT_KEYS = [
  "productName",
  "canonicalOrigin",
  "primaryColor",
  "supportEmail",
  "legalName",
  "legalAddress",
  "logoUrl",
] as const;

type EmailBrandInputField = (typeof BRAND_INPUT_KEYS)[number];
type EmailBrandValidationField = EmailBrandInputField | "brand";

export type EmailBrandInput = {
  readonly productName: unknown;
  readonly canonicalOrigin: unknown;
  readonly primaryColor: unknown;
  readonly supportEmail: unknown;
  readonly legalName: unknown;
  readonly legalAddress: unknown;
  readonly logoUrl?: unknown;
};

export class EmailBrandValidationError extends Error {
  readonly field: EmailBrandValidationField;

  constructor(field: EmailBrandValidationField) {
    super(`Invalid email brand: ${field}`);
    this.name = "EmailBrandValidationError";
    this.field = field;
  }
}

function invalidBrand(field: EmailBrandValidationField): never {
  throw new EmailBrandValidationError(field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedSingleLine(
  value: unknown,
  field: EmailBrandInputField,
  maximumLength: number,
): string {
  if (typeof value !== "string") invalidBrand(field);

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    invalidBrand(field);
  }

  return normalized;
}

function normalizeCanonicalOrigin(value: unknown): string {
  if (typeof value !== "string") invalidBrand("canonicalOrigin");

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      invalidBrand("canonicalOrigin");
    }

    return url.origin;
  } catch {
    invalidBrand("canonicalOrigin");
  }
}

function normalizePrimaryColor(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/u.test(value)) {
    invalidBrand("primaryColor");
  }

  return value.toUpperCase();
}

function normalizeSupportEmail(value: unknown): string {
  if (typeof value !== "string") invalidBrand("supportEmail");

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 320 ||
    !z.email().safeParse(normalized).success
  ) {
    invalidBrand("supportEmail");
  }

  return normalized;
}

function normalizeLogoUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") invalidBrand("logoUrl");

  const normalized = value.trim();
  if (normalized === "") return null;
  if (normalized.length > 2_048) invalidBrand("logoUrl");

  try {
    const url = new URL(normalized);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== ""
    ) {
      invalidBrand("logoUrl");
    }

    return url.toString();
  } catch {
    invalidBrand("logoUrl");
  }
}

function relativeLuminance(primaryColor: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(primaryColor.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function selectActionForeground(
  primaryColor: string,
): EmailBrand["actionForeground"] {
  const luminance = relativeLuminance(primaryColor);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);

  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}

export function validateEmailBrand(input: unknown): EmailBrand {
  if (!isRecord(input)) invalidBrand("brand");

  const keys = Object.keys(input);
  if (
    keys.some(
      (key) => !BRAND_INPUT_KEYS.includes(key as EmailBrandInputField),
    )
  ) {
    invalidBrand("brand");
  }

  const primaryColor = normalizePrimaryColor(input.primaryColor);
  return Object.freeze({
    productName: normalizedSingleLine(input.productName, "productName", 70),
    canonicalOrigin: normalizeCanonicalOrigin(input.canonicalOrigin),
    primaryColor,
    actionForeground: selectActionForeground(primaryColor),
    supportEmail: normalizeSupportEmail(input.supportEmail),
    legalName: normalizedSingleLine(input.legalName, "legalName", 200),
    legalAddress: normalizedSingleLine(
      input.legalAddress,
      "legalAddress",
      500,
    ),
    logoUrl: normalizeLogoUrl(input.logoUrl),
  });
}