import "server-only";

import { createHash, randomBytes } from "node:crypto";

const ACCOUNT_SECURITY_TOKEN_TTL_MS = 10 * 60_000;

type RandomBytes = (size: number) => Buffer;

export function createAccountSecurityToken(generateBytes: RandomBytes = randomBytes) {
  return { raw: generateBytes(32).toString("base64url") };
}

export function hashAccountSecurityToken(rawToken: string, secret: string) {
  return createHash("sha256").update(`${rawToken}${secret}`).digest("hex");
}

export function getAccountSecurityTokenExpiry(issuedAt = new Date()) {
  return new Date(issuedAt.getTime() + ACCOUNT_SECURITY_TOKEN_TTL_MS);
}

export function createAccountSecurityCredential({
  secret,
  issuedAt = new Date(),
  randomBytes: generateBytes = randomBytes,
}: {
  secret: string;
  issuedAt?: Date;
  randomBytes?: RandomBytes;
}) {
  const { raw } = createAccountSecurityToken(generateBytes);
  return {
    raw,
    persisted: {
      token: hashAccountSecurityToken(raw, secret),
      expires: getAccountSecurityTokenExpiry(issuedAt),
    },
  };
}