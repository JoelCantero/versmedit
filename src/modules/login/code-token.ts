import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { LOGIN_CODE_ALPHABET, LOGIN_CODE_LENGTH } from "@/modules/login/code";

export function generateLoginCode() {
  let code = "";
  for (let index = 0; index < LOGIN_CODE_LENGTH; index += 1) {
    code += LOGIN_CODE_ALPHABET[randomInt(0, LOGIN_CODE_ALPHABET.length)];
  }
  return code;
}

// Keyed with the auth secret so a database dump alone cannot brute-force the
// 50-bit code, and bound to the address so a code is useless for another one.
export function hashLoginCode({
  identifier,
  code,
  secret,
}: {
  identifier: string;
  code: string;
  secret: string;
}) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  return createHash("sha256")
    .update(`login-code:${normalizedIdentifier}:${code}${secret}`)
    .digest("hex");
}

export function loginCodeHashesMatch(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}
