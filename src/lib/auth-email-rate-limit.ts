import { createHash } from "node:crypto";

const AUTH_EMAIL_ADDRESS_RATE_LIMIT_PREFIX = "auth:email:address:";

export function getAuthEmailAddressRateLimitKey(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalizedEmail).digest("hex");
  return `${AUTH_EMAIL_ADDRESS_RATE_LIMIT_PREFIX}${digest}`;
}