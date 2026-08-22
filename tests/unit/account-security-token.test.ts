// @vitest-environment node

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAccountSecurityCredential,
  createAccountSecurityToken,
  getAccountSecurityTokenExpiry,
  hashAccountSecurityToken,
} from "@/modules/account/security/token";

describe("account security token", () => {
  it("generates one canonical 32-byte Base64URL credential", () => {
    const random = vi.fn((size: number) => Buffer.alloc(size, 0xa5));

    const token = createAccountSecurityToken(random).raw;

    expect(random).toHaveBeenCalledExactlyOnceWith(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(Buffer.from(token, "base64url").toString("base64url")).toBe(token);
  });

  it("uses the established secret-salted SHA-256 digest", () => {
    const rawToken = "raw-security-token";
    const secret = "account-security-secret";

    expect(hashAccountSecurityToken(rawToken, secret)).toBe(
      createHash("sha256").update(`${rawToken}${secret}`).digest("hex"),
    );
  });

  it("expires exactly ten minutes after issuance", () => {
    const issuedAt = new Date("2026-08-22T12:00:00.000Z");

    expect(getAccountSecurityTokenExpiry(issuedAt)).toEqual(
      new Date("2026-08-22T12:10:00.000Z"),
    );
  });

  it("keeps the raw credential outside the persistence payload", () => {
    const issuedAt = new Date("2026-08-22T12:00:00.000Z");
    const random = vi.fn((size: number) => Buffer.alloc(size, 0x5a));
    const credential = createAccountSecurityCredential({
      secret: "test-auth-secret",
      issuedAt,
      randomBytes: random,
    });

    expect(credential.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(credential.persisted).toEqual({
      token: hashAccountSecurityToken(
        credential.raw,
        "test-auth-secret",
      ),
      expires: new Date("2026-08-22T12:10:00.000Z"),
    });
    expect(JSON.stringify(credential.persisted)).not.toContain(credential.raw);
  });
});