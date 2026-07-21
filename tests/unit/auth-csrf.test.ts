// @vitest-environment node

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateAuthCsrfToken } from "@/lib/auth-csrf";

const secret = "a-secure-auth-secret-that-is-long-enough";
const token = "csrf-token-value";
const hash = createHash("sha256").update(`${token}${secret}`).digest("hex");

describe("Auth.js CSRF prevalidation", () => {
  it.each([
    "next-auth.csrf-token",
    "__Secure-next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
  ])(
    "accepts a signed double-submit token from %s",
    (cookieName) => {
      expect(
        validateAuthCsrfToken({
          bodyToken: token,
          cookieHeader: `${cookieName}=${encodeURIComponent(`${token}|${hash}`)}`,
          secret,
        }),
      ).toBe(true);
    },
  );

  it.each([
    { bodyToken: undefined, cookieHeader: undefined },
    { bodyToken: token, cookieHeader: "other=value" },
    { bodyToken: token, cookieHeader: "next-auth.csrf-token=malformed" },
    {
      bodyToken: "different-token",
      cookieHeader: `next-auth.csrf-token=${token}%7C${hash}`,
    },
    {
      bodyToken: token,
      cookieHeader: `next-auth.csrf-token=${token}%7C${"0".repeat(64)}`,
    },
  ])("rejects missing, malformed, or mismatched values", (input) => {
    expect(validateAuthCsrfToken({ ...input, secret })).toBe(false);
  });

  it("rejects unequal-length values without throwing", () => {
    expect(
      validateAuthCsrfToken({
        bodyToken: `${token}-longer`,
        cookieHeader: `next-auth.csrf-token=${token}%7C${hash}`,
        secret,
      }),
    ).toBe(false);
  });
});