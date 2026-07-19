import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

interface ValidateAuthCsrfTokenOptions {
  bodyToken?: string;
  cookieHeader?: string;
  secret: string;
}

const CSRF_COOKIE_NAMES = [
  "__Secure-next-auth.csrf-token",
  "next-auth.csrf-token",
] as const;

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCsrfCookie(cookieHeader?: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!CSRF_COOKIE_NAMES.includes(name as (typeof CSRF_COOKIE_NAMES)[number])) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function validateAuthCsrfToken({
  bodyToken,
  cookieHeader,
  secret,
}: ValidateAuthCsrfTokenOptions) {
  if (!bodyToken || !secret) return false;

  const cookieValue = readCsrfCookie(cookieHeader);
  if (!cookieValue) return false;

  const separator = cookieValue.indexOf("|");
  if (separator < 1 || cookieValue.indexOf("|", separator + 1) >= 0) {
    return false;
  }

  const cookieToken = cookieValue.slice(0, separator);
  const cookieHash = cookieValue.slice(separator + 1);
  const expectedHash = createHash("sha256")
    .update(`${cookieToken}${secret}`)
    .digest("hex");

  return (
    constantTimeEqual(cookieHash, expectedHash) &&
    constantTimeEqual(cookieToken, bodyToken)
  );
}