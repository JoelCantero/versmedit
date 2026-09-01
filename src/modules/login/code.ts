// Access code alphabet and normalization. Kept free of node:crypto so the login
// client can import it; generation and hashing live in code-token.ts.

export const LOGIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const LOGIN_CODE_LENGTH = 10;

const FORMATTING_PATTERN = /[\s-]+/gu;

const LOGIN_CODE_PATTERN = new RegExp(
  `^[${LOGIN_CODE_ALPHABET}]{${LOGIN_CODE_LENGTH}}$`,
  "u",
);

export function normalizeLoginCode(value: string) {
  return value.replace(FORMATTING_PATTERN, "").toUpperCase();
}

export function isLoginCode(value: string) {
  return LOGIN_CODE_PATTERN.test(value);
}
