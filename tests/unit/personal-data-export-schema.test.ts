// @vitest-environment node

import { VerificationPurpose } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPersonalDataExportLoginPath,
  getPersonalDataExportStatePath,
  getPersonalDataExportVerificationUrl,
  isCredentialFreePersonalDataExportPath,
  parsePersonalDataExportCallback,
  parsePersonalDataExportRequestBody,
  personalDataExportCommandSchema,
} from "@/modules/account/data-export/schema";
import {
  comparePersonalDataExportTokenDigests,
  createPersonalDataExportCredential,
  hashPersonalDataExportToken,
  PERSONAL_DATA_EXPORT_TOKEN_TTL_MS,
} from "@/modules/account/data-export/token";

describe("personal data export schemas and credentials", () => {
  it("accepts only the exact csrfToken and locale command", () => {
    expect(
      personalDataExportCommandSchema.parse({ csrfToken: "proof", locale: "ca" }),
    ).toEqual({ csrfToken: "proof", locale: "ca" });
    for (const body of [
      { csrfToken: "proof", locale: "fr" },
      { csrfToken: "proof", locale: "en", email: "person@example.test" },
      { csrfToken: "proof", locale: "en", userId: "owner" },
      { csrfToken: "proof", locale: "en", sessionId: "session" },
      { csrfToken: "proof", locale: "en", purpose: "ACCOUNT_DATA_EXPORT" },
      { csrfToken: "proof", locale: "en", contributors: ["account"] },
    ]) {
      expect(personalDataExportCommandSchema.safeParse(body).success).toBe(false);
    }
  });

  it("rejects malformed JSON and duplicate top-level fields", () => {
    expect(parsePersonalDataExportRequestBody("not-json")).toBeNull();
    expect(
      parsePersonalDataExportRequestBody(
        '{"csrfToken":"one","csrfToken":"two","locale":"en"}',
      ),
    ).toBeNull();
  });

  it("parses exactly one canonical credential and one supported locale", () => {
    const rawToken = Buffer.alloc(32, 7).toString("base64url");
    expect(
      parsePersonalDataExportCallback(
        new URLSearchParams({ token: rawToken, locale: "es" }),
      ),
    ).toEqual({ rawToken, locale: "es" });

    for (const query of [
      `token=${rawToken}`,
      `token=${rawToken}&locale=fr`,
      `token=${rawToken.slice(1)}&locale=en`,
      `token=${rawToken}&locale=en&returnTo=https://attacker.example`,
      `token=${rawToken}&token=${rawToken}&locale=en`,
    ]) {
      expect(
        parsePersonalDataExportCallback(new URLSearchParams(query)),
      ).toBeNull();
    }
  });

  it("creates 32-byte credentials, stores only a digest, and expires at 15 minutes", () => {
    const issuedAt = new Date("2026-08-23T12:00:00.000Z");
    const secret = "credential-test-secret-at-least-32-characters";
    const credential = createPersonalDataExportCredential({
      secret,
      issuedAt,
      randomBytes: (size) => Buffer.alloc(size, 9),
    });

    expect(credential.raw).toHaveLength(43);
    expect(credential.persisted.token).toMatch(/^[a-f0-9]{64}$/u);
    expect(credential.persisted.token).not.toContain(credential.raw);
    expect(credential.persisted.expires.getTime() - issuedAt.getTime()).toBe(
      PERSONAL_DATA_EXPORT_TOKEN_TTL_MS,
    );
    const sameDigest = hashPersonalDataExportToken(credential.raw, secret);
    expect(
      comparePersonalDataExportTokenDigests(
        credential.persisted.token,
        sameDigest,
      ),
    ).toBe(true);
    expect(
      comparePersonalDataExportTokenDigests(
        credential.persisted.token,
        "0".repeat(64),
      ),
    ).toBe(false);
  });

  it("keeps the purpose distinct from every authentication or account-action purpose", () => {
    expect(VerificationPurpose.ACCOUNT_DATA_EXPORT).not.toBe(
      VerificationPurpose.LOGIN,
    );
    expect(VerificationPurpose.ACCOUNT_DATA_EXPORT).not.toBe(
      VerificationPurpose.SIGNUP,
    );
    expect(VerificationPurpose.ACCOUNT_DATA_EXPORT).not.toBe(
      VerificationPurpose.ACCOUNT_DELETION,
    );
    expect(VerificationPurpose.ACCOUNT_DATA_EXPORT).not.toBe(
      VerificationPurpose.ACCOUNT_SECURITY,
    );
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount%2Fdata"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount%2Fdata"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata"],
  ] as const)("builds the fixed %s login path", (locale, expected) => {
    expect(getPersonalDataExportLoginPath(locale)).toBe(expected);
  });

  it("builds one purpose route and only credential-free result redirects", () => {
    const rawToken = Buffer.alloc(32, 11).toString("base64url");
    const verification = new URL(
      getPersonalDataExportVerificationUrl({
        origin: "https://app.example.test/untrusted",
        rawToken,
        locale: "ca",
      }),
    );
    expect(verification.origin).toBe("https://app.example.test");
    expect(verification.pathname).toBe("/api/account/data-export/verify");
    expect(verification.searchParams.get("token")).toBe(rawToken);
    expect(verification.searchParams.get("locale")).toBe("ca");

    const clean = getPersonalDataExportStatePath("ca", "ready");
    expect(clean).toBe("/ca/account/data?exportState=ready");
    expect(isCredentialFreePersonalDataExportPath(clean)).toBe(true);
    expect(
      isCredentialFreePersonalDataExportPath(
        `${clean}&token=${encodeURIComponent(rawToken)}`,
      ),
    ).toBe(false);
    expect(
      isCredentialFreePersonalDataExportPath("https://attacker.example/account/data?exportState=ready"),
    ).toBe(false);
  });
});