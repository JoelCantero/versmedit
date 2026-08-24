import { z } from "zod";

import type { AccountLocale } from "@/modules/account/types";
import type { PersonalDataExportVerificationResult } from "@/modules/account/data-export/types";

const MAX_RETRY_AFTER_SECONDS = 15 * 60;

function hasDuplicateTopLevelKeys(source: string) {
  const keys = new Set<string>();
  let objectDepth = 0;
  let arrayDepth = 0;
  let stringStart = -1;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (stringStart >= 0) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') {
        if (objectDepth === 1 && arrayDepth === 0) {
          let next = index + 1;
          while (/\s/u.test(source[next] ?? "")) next += 1;
          if (source[next] === ":") {
            const key = JSON.parse(source.slice(stringStart, index + 1)) as string;
            if (keys.has(key)) return true;
            keys.add(key);
          }
        }
        stringStart = -1;
      }
      continue;
    }

    if (character === '"') stringStart = index;
    else if (character === "{") objectDepth += 1;
    else if (character === "}") objectDepth -= 1;
    else if (character === "[") arrayDepth += 1;
    else if (character === "]") arrayDepth -= 1;
  }

  return false;
}

export function parsePersonalDataExportRequestBody(source: string): unknown {
  try {
    const parsed = JSON.parse(source) as unknown;
    return hasDuplicateTopLevelKeys(source) ? null : parsed;
  } catch {
    return null;
  }
}

export const personalDataExportLocaleSchema = z.enum(["en", "es", "ca"]);

export const personalDataExportCommandSchema = z
  .object({
    csrfToken: z.string().min(1),
    locale: personalDataExportLocaleSchema,
  })
  .strict();

export const personalDataExportCredentialSchema = z.string().regex(
  /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u,
  "Invalid personal data export credential",
);

const callbackStateSchema = z.enum(["ready", "invalid", "rate_limited"]);
const retryAfterSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_RETRY_AFTER_SECONDS);

export function parsePersonalDataExportLocale(value: unknown): AccountLocale {
  return personalDataExportLocaleSchema.parse(value);
}

export function parsePersonalDataExportCallback(
  searchParams: URLSearchParams,
): { rawToken: string; locale: AccountLocale } | null {
  const entries = [...searchParams.entries()];
  if (
    entries.length !== 2 ||
    entries.filter(([key]) => key === "token").length !== 1 ||
    entries.filter(([key]) => key === "locale").length !== 1
  ) {
    return null;
  }

  const rawToken = personalDataExportCredentialSchema.safeParse(
    searchParams.get("token"),
  );
  const locale = personalDataExportLocaleSchema.safeParse(
    searchParams.get("locale"),
  );
  return rawToken.success && locale.success
    ? { rawToken: rawToken.data, locale: locale.data }
    : null;
}

export function parsePersonalDataExportCallbackNotice(
  searchParams: URLSearchParams,
): PersonalDataExportVerificationResult | null {
  const entries = [...searchParams.entries()];
  const state = callbackStateSchema.safeParse(searchParams.get("exportState"));
  if (!state.success) return null;

  if (state.data !== "rate_limited") {
    return entries.length === 1 && entries[0]?.[0] === "exportState"
      ? { status: state.data, locale: "en" }
      : null;
  }

  const retryAfter = retryAfterSchema.safeParse(
    searchParams.get("retryAfter"),
  );
  if (
    entries.length !== 2 ||
    entries.filter(([key]) => key === "exportState").length !== 1 ||
    entries.filter(([key]) => key === "retryAfter").length !== 1 ||
    !retryAfter.success
  ) {
    return null;
  }
  return {
    status: "rate_limited",
    locale: "en",
    retryAfter: retryAfter.data,
  };
}

export function getPersonalDataExportPath(locale: AccountLocale) {
  return locale === "en" ? "/account/data" : `/${locale}/account/data`;
}

export function getPersonalDataExportLoginPath(locale: AccountLocale) {
  const loginPath = locale === "en" ? "/login" : `/${locale}/login`;
  return `${loginPath}?callbackUrl=${encodeURIComponent(getPersonalDataExportPath(locale))}`;
}

export function getPersonalDataExportVerificationUrl({
  origin,
  rawToken,
  locale,
}: {
  origin: string;
  rawToken: string;
  locale: AccountLocale;
}) {
  const credential = personalDataExportCredentialSchema.parse(rawToken);
  const url = new URL("/api/account/data-export/verify", new URL(origin).origin);
  url.searchParams.set("token", credential);
  url.searchParams.set("locale", locale);
  return url.toString();
}

export function getPersonalDataExportStatePath(
  locale: AccountLocale,
  state: PersonalDataExportVerificationResult["status"],
  retryAfter?: number,
) {
  const url = new URL(getPersonalDataExportPath(locale), "https://local.invalid");
  url.searchParams.set("exportState", callbackStateSchema.parse(state));
  if (state === "rate_limited") {
    url.searchParams.set("retryAfter", String(retryAfterSchema.parse(retryAfter)));
  }
  return `${url.pathname}${url.search}`;
}

export function isCredentialFreePersonalDataExportPath(value: string) {
  if (!value.startsWith("/")) return false;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.hash) return false;
    const locale = url.pathname.startsWith("/es/")
      ? "es"
      : url.pathname.startsWith("/ca/")
        ? "ca"
        : "en";
    if (url.pathname !== getPersonalDataExportPath(locale)) return false;
    const notice = parsePersonalDataExportCallbackNotice(url.searchParams);
    return notice !== null;
  } catch {
    return false;
  }
}