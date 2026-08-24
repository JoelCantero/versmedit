import "server-only";

import { createHash } from "node:crypto";

import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";

export const PERSONAL_DATA_EXPORT_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
export const PERSONAL_DATA_EXPORT_REQUEST_CLIENT_LIMIT = 5;
export const PERSONAL_DATA_EXPORT_REQUEST_ACCOUNT_LIMIT = 3;
export const PERSONAL_DATA_EXPORT_CONFIRMATION_CLIENT_LIMIT = 5;
export const PERSONAL_DATA_EXPORT_GENERATION_SESSION_LIMIT = 3;

function digestScopeValue(value: string) {
  if (value.length === 0) throw new Error("Rate-limit scope cannot be empty");
  return createHash("sha256").update(value).digest("hex");
}

export function getPersonalDataExportRequestClientRateLimitKey(
  clientIdentifier: string,
) {
  return `account:data-export:request:client:${digestScopeValue(clientIdentifier)}`;
}

export function getPersonalDataExportRequestAccountRateLimitKey(
  normalizedEmail: string,
) {
  return `account:data-export:request:account:${digestScopeValue(normalizedEmail.trim().toLowerCase())}`;
}

export function getPersonalDataExportConfirmationClientRateLimitKey(
  clientIdentifier: string,
) {
  return `account:data-export:verify:client:${digestScopeValue(clientIdentifier)}`;
}

export function getPersonalDataExportGenerationSessionRateLimitKey(
  sessionId: string,
) {
  return `account:data-export:generate:session:${digestScopeValue(sessionId)}`;
}

export function consumePersonalDataExportRequestClientLimit(
  clientIdentifier: string,
) {
  return consumeSharedRateLimit({
    key: getPersonalDataExportRequestClientRateLimitKey(clientIdentifier),
    limit: PERSONAL_DATA_EXPORT_REQUEST_CLIENT_LIMIT,
    windowMs: PERSONAL_DATA_EXPORT_RATE_LIMIT_WINDOW_MS,
    logCleanupErrors: false,
  });
}

export function consumePersonalDataExportRequestAccountLimit(
  normalizedEmail: string,
) {
  return consumeSharedRateLimit({
    key: getPersonalDataExportRequestAccountRateLimitKey(normalizedEmail),
    limit: PERSONAL_DATA_EXPORT_REQUEST_ACCOUNT_LIMIT,
    windowMs: PERSONAL_DATA_EXPORT_RATE_LIMIT_WINDOW_MS,
    logCleanupErrors: false,
  });
}

export function consumePersonalDataExportConfirmationClientLimit(
  clientIdentifier: string,
) {
  return consumeSharedRateLimit({
    key: getPersonalDataExportConfirmationClientRateLimitKey(clientIdentifier),
    limit: PERSONAL_DATA_EXPORT_CONFIRMATION_CLIENT_LIMIT,
    windowMs: PERSONAL_DATA_EXPORT_RATE_LIMIT_WINDOW_MS,
    logCleanupErrors: false,
  });
}

export function consumePersonalDataExportGenerationSessionLimit(
  sessionId: string,
) {
  return consumeSharedRateLimit({
    key: getPersonalDataExportGenerationSessionRateLimitKey(sessionId),
    limit: PERSONAL_DATA_EXPORT_GENERATION_SESSION_LIMIT,
    windowMs: PERSONAL_DATA_EXPORT_RATE_LIMIT_WINDOW_MS,
    logCleanupErrors: false,
  });
}