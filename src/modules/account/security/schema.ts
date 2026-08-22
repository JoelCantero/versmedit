import { z } from "zod";

import type { AccountLocale } from "@/modules/account/types";
import {
  ACCOUNT_SECURITY_BULK_CONFIRMATION,
  ACCOUNT_SECURITY_INDIVIDUAL_CONFIRMATION,
  accountSecurityCallbackStates,
  type AccountSecurityCallbackState,
} from "@/modules/account/security/types";

function hasDuplicateTopLevelKeys(source: string) {
  const keys = new Set<string>();
  let objectDepth = 0;
  let arrayDepth = 0;
  let stringStart = -1;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (stringStart >= 0) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
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

export function parseAccountSecurityRequestBody(source: string): unknown {
  try {
    const parsed = JSON.parse(source) as unknown;
    return hasDuplicateTopLevelKeys(source) ? null : parsed;
  } catch {
    return null;
  }
}

export const accountSecurityLocaleSchema = z.enum(["en", "es", "ca"]);

export const accountSecurityReauthenticationSchema = z
  .object({
    csrfToken: z.string().min(1),
    locale: accountSecurityLocaleSchema,
  })
  .strict();

export const accountSecurityIndividualCommandSchema = z
  .object({
    csrfToken: z.string().min(1),
    locale: accountSecurityLocaleSchema,
    confirmation: z.literal(ACCOUNT_SECURITY_INDIVIDUAL_CONFIRMATION),
    sessionId: z.string().min(1).max(128),
  })
  .strict();

export const accountSecurityBulkCommandSchema = z
  .object({
    csrfToken: z.string().min(1),
    locale: accountSecurityLocaleSchema,
    confirmation: z.literal(ACCOUNT_SECURITY_BULK_CONFIRMATION),
  })
  .strict();

const accountSecurityCallbackStateSchema = z.enum(
  accountSecurityCallbackStates,
);
const accountSecurityCallbackTokenSchema = z.string().regex(
  /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/,
);

export function parseAccountSecurityLocale(value: unknown) {
  return accountSecurityLocaleSchema.parse(value);
}

export function getAccountSecurityPath(locale: AccountLocale) {
  return locale === "en" ? "/account/security" : `/${locale}/account/security`;
}

export function getAccountSecurityLoginPath(locale: AccountLocale) {
  const loginPath = locale === "en" ? "/login" : `/${locale}/login`;
  return `${loginPath}?callbackUrl=${encodeURIComponent(getAccountSecurityPath(locale))}`;
}

export function parseAccountSecurityCallbackState(
  value: unknown,
): AccountSecurityCallbackState | null {
  const parsed = accountSecurityCallbackStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseAccountSecurityCallbackToken(
  searchParams: URLSearchParams,
) {
  const entries = [...searchParams.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== "token") return null;

  const parsed = accountSecurityCallbackTokenSchema.safeParse(entries[0][1]);
  return parsed.success ? parsed.data : null;
}

export function getAccountSecurityCallbackPath(
  locale: AccountLocale,
  state: AccountSecurityCallbackState,
) {
  return `${getAccountSecurityPath(locale)}?state=${state}`;
}

export function getAccountSecurityRecoveryPath(locale: AccountLocale) {
  return `${getAccountSecurityPath(locale)}?state=recovered`;
}