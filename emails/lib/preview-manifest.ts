import {
  EMAIL_LOCALES,
  EMAIL_VARIANT_DEFINITIONS,
  EMAIL_VARIANTS,
  type EmailLocale,
  type EmailPresentationRequest,
  type EmailVariant,
} from "../../src/lib/email/presentation";

import { createPreviewRequest } from "./preview-fixtures";

export type PreviewManifestEntry = Readonly<{
  key: `${EmailLocale}:${EmailVariant}`;
  path: `/${EmailLocale}/${EmailVariant}`;
  locale: EmailLocale;
  variant: EmailVariant;
  classification: "operational" | "preview-only";
  request: EmailPresentationRequest;
}>;

export const previewManifest: readonly PreviewManifestEntry[] = Object.freeze(
  EMAIL_LOCALES.flatMap((locale) =>
    EMAIL_VARIANTS.map((variant) =>
      Object.freeze({
        key: `${locale}:${variant}` as const,
        path: `/${locale}/${variant}` as const,
        locale,
        variant,
        classification: EMAIL_VARIANT_DEFINITIONS[variant].classification,
        request: createPreviewRequest(variant, locale),
      }),
    ),
  ),
);

export function findPreviewEntry(locale: string, variant: string) {
  return previewManifest.find(
    (entry) => entry.locale === locale && entry.variant === variant,
  );
}