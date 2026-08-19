import { createHash, randomBytes } from "node:crypto";

const SIGNUP_TOKEN_TTL_MS = 15 * 60_000;

export function createSignupToken() {
  return { raw: randomBytes(32).toString("base64url") };
}

export function hashSignupToken(rawToken: string, secret: string) {
  return createHash("sha256").update(`${rawToken}${secret}`).digest("hex");
}

export function getSignupTokenExpiry(issuedAt = new Date()) {
  return new Date(issuedAt.getTime() + SIGNUP_TOKEN_TTL_MS);
}

export function createSignupCredential({
  secret,
  issuedAt = new Date(),
}: {
  secret: string;
  issuedAt?: Date;
}) {
  const { raw } = createSignupToken();
  return {
    raw,
    persisted: {
      token: hashSignupToken(raw, secret),
      expires: getSignupTokenExpiry(issuedAt),
    },
  };
}