import { z } from "zod";

import type { AccountLocale } from "@/modules/account/types";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_PENDING_STORAGE_KEY,
  type PendingAccountDeletionSignal,
} from "@/modules/account/deletion/types";

const PENDING_SIGNAL_TTL_MS = 10 * 60_000;

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

export function parseAccountDeletionRequestBody(source: string): unknown {
  try {
    const parsed = JSON.parse(source) as unknown;
    return hasDuplicateTopLevelKeys(source) ? null : parsed;
  } catch {
    return null;
  }
}

export const accountDeletionLocaleSchema = z.enum(["en", "es", "ca"]);

export const accountDeletionReauthenticationSchema = z
  .object({
    csrfToken: z.string().min(1),
    locale: accountDeletionLocaleSchema,
  })
  .strict();

export const accountDeletionCommandSchema = z
  .object({
    csrfToken: z.string().min(1),
    locale: accountDeletionLocaleSchema,
    confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
  })
  .strict();

const pendingDeletionSignalSchema = z
  .object({
    locale: accountDeletionLocaleSchema,
    expiresAt: z.number().int().positive(),
  })
  .strict();

interface PendingDeletionStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem?(key: string, value: string): void;
}

export function parseAccountDeletionLocale(value: unknown) {
  return accountDeletionLocaleSchema.parse(value);
}

export function getAccountDataPath(locale: AccountLocale) {
  return locale === "en" ? "/account/data" : `/${locale}/account/data`;
}

export function getAccountDeletionIntentPath(locale: AccountLocale) {
  return `${getAccountDataPath(locale)}?intent=delete`;
}

export function getAccountDeletionCompletionPath(locale: AccountLocale) {
  return locale === "en" ? "/account-deleted" : `/${locale}/account-deleted`;
}

export function getAccountDeletionLoginPath(locale: AccountLocale) {
  const loginPath = locale === "en" ? "/login" : `/${locale}/login`;
  return `${loginPath}?callbackUrl=${encodeURIComponent(getAccountDataPath(locale))}`;
}

export function createPendingDeletionSignal(
  locale: AccountLocale,
  now = Date.now(),
): PendingAccountDeletionSignal {
  return { locale, expiresAt: now + PENDING_SIGNAL_TTL_MS };
}

export function parsePendingDeletionSignal(
  value: string | null,
  now = Date.now(),
): PendingAccountDeletionSignal | null {
  if (!value) return null;

  try {
    const parsed = pendingDeletionSignalSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return null;
    if (parsed.data.expiresAt <= now) return null;
    if (parsed.data.expiresAt > now + PENDING_SIGNAL_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writePendingDeletionSignal(
  storage: PendingDeletionStorage,
  locale: AccountLocale,
  now = Date.now(),
) {
  const signal = createPendingDeletionSignal(locale, now);
  storage.setItem?.(ACCOUNT_DELETION_PENDING_STORAGE_KEY, JSON.stringify(signal));
  return signal;
}

export function clearPendingDeletionSignal(storage: PendingDeletionStorage) {
  storage.removeItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY);
}

export async function recoverPendingDeletion({
  storage,
  checkSession,
  now = Date.now(),
}: {
  storage: PendingDeletionStorage;
  checkSession: () => Promise<boolean>;
  now?: number;
}) {
  const signal = parsePendingDeletionSignal(
    storage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY),
    now,
  );
  if (!signal) {
    clearPendingDeletionSignal(storage);
    return { status: "none" as const };
  }

  try {
    const sessionStillAuthorizes = await checkSession();
    clearPendingDeletionSignal(storage);
    if (sessionStillAuthorizes) return { status: "retry" as const };
    return {
      status: "completed" as const,
      redirectTo: getAccountDeletionCompletionPath(signal.locale),
    };
  } catch {
    return { status: "pending" as const };
  }
}