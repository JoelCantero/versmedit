// @vitest-environment node

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSignupCredential,
  createSignupToken,
  getSignupTokenExpiry,
  hashSignupToken,
} from "@/modules/signup/token";

describe("signup token", () => {
  it("generates a 32-byte Base64URL raw token", () => {
    const token = createSignupToken().raw;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("uses the Auth.js salted SHA-256 token hash", () => {
    const raw = "raw-token";
    const secret = "auth-secret";
    expect(hashSignupToken(raw, secret)).toBe(
      createHash("sha256").update(`${raw}${secret}`).digest("hex"),
    );
  });

  it("expires exactly 15 minutes after issuance", () => {
    const issuedAt = new Date("2026-08-18T12:00:00.000Z");
    expect(getSignupTokenExpiry(issuedAt)).toEqual(
      new Date("2026-08-18T12:15:00.000Z"),
    );
  });

  it("keeps the raw credential outside the persistence payload", () => {
    const issuedAt = new Date("2026-08-18T12:00:00.000Z");
    const credential = createSignupCredential({
      secret: "test-auth-secret",
      issuedAt,
    });

    expect(credential.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(credential.persisted).toEqual({
      token: hashSignupToken(credential.raw, "test-auth-secret"),
      expires: new Date("2026-08-18T12:15:00.000Z"),
    });
    expect(JSON.stringify(credential.persisted)).not.toContain(credential.raw);
  });
});