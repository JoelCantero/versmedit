import { createHash } from "node:crypto";

const LOGIN_CODE_CLIENT_RATE_LIMIT_PREFIX = "auth:login-code:client:";
const LOGIN_CODE_ADDRESS_RATE_LIMIT_PREFIX = "auth:login-code:address:";

export const LOGIN_CODE_RATE_LIMIT = 10;

export const LOGIN_CODE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1_000;

export function getLoginCodeClientRateLimitKey(clientIdentifier: string) {
  return `${LOGIN_CODE_CLIENT_RATE_LIMIT_PREFIX}${clientIdentifier}`;
}

export function getLoginCodeAddressRateLimitKey(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalizedEmail).digest("hex");
  return `${LOGIN_CODE_ADDRESS_RATE_LIMIT_PREFIX}${digest}`;
}
