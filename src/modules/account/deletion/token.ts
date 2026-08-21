import "server-only";

import { createHash, randomBytes } from "node:crypto";

const ACCOUNT_DELETION_TOKEN_TTL_MS = 10 * 60_000;

export function createAccountDeletionToken() {
  return { raw: randomBytes(32).toString("base64url") };
}

export function hashAccountDeletionToken(rawToken: string, secret: string) {
  return createHash("sha256").update(`${rawToken}${secret}`).digest("hex");
}

export function getAccountDeletionTokenExpiry(issuedAt = new Date()) {
  return new Date(issuedAt.getTime() + ACCOUNT_DELETION_TOKEN_TTL_MS);
}

export function createAccountDeletionCredential({
  secret,
  issuedAt = new Date(),
}: {
  secret: string;
  issuedAt?: Date;
}) {
  const { raw } = createAccountDeletionToken();
  return {
    raw,
    persisted: {
      token: hashAccountDeletionToken(raw, secret),
      expires: getAccountDeletionTokenExpiry(issuedAt),
    },
  };
}