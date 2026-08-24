import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const PERSONAL_DATA_EXPORT_TOKEN_TTL_MS = 15 * 60_000;

type RandomBytes = (size: number) => Buffer;

export function createPersonalDataExportToken(
  generateBytes: RandomBytes = randomBytes,
) {
  const entropy = generateBytes(32);
  if (entropy.byteLength !== 32) {
    throw new Error("Personal data export credentials require 32 random bytes");
  }
  return { raw: entropy.toString("base64url") };
}

export function hashPersonalDataExportToken(rawToken: string, secret: string) {
  return createHash("sha256").update(`${rawToken}${secret}`).digest("hex");
}

export function comparePersonalDataExportTokenDigests(
  left: string,
  right: string,
) {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function getPersonalDataExportTokenExpiry(issuedAt = new Date()) {
  return new Date(issuedAt.getTime() + PERSONAL_DATA_EXPORT_TOKEN_TTL_MS);
}

export function createPersonalDataExportCredential({
  secret,
  issuedAt = new Date(),
  randomBytes: generateBytes = randomBytes,
}: {
  secret: string;
  issuedAt?: Date;
  randomBytes?: RandomBytes;
}) {
  const { raw } = createPersonalDataExportToken(generateBytes);
  return {
    raw,
    persisted: {
      token: hashPersonalDataExportToken(raw, secret),
      expires: getPersonalDataExportTokenExpiry(issuedAt),
    },
  };
}