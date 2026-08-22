import { describe, expect, it } from "vitest";

import {
  accountSecurityReauthenticationSchema,
  accountSecurityIndividualCommandSchema,
  getAccountSecurityCallbackPath,
  getAccountSecurityLoginPath,
  getAccountSecurityPath,
  getAccountSecurityRecoveryPath,
  parseAccountSecurityCallbackToken,
  parseAccountSecurityCallbackState,
  parseAccountSecurityLocale,
  parseAccountSecurityRequestBody,
} from "@/modules/account/security/schema";

describe("account security input contracts", () => {
  it.each(["en", "es", "ca"] as const)(
    "accepts the supported locale %s",
    (locale) => {
      expect(parseAccountSecurityLocale(locale)).toBe(locale);
    },
  );

  it.each(["", "fr", "EN", null, 1])(
    "rejects unsupported locale %j",
    (locale) => {
      expect(() => parseAccountSecurityLocale(locale)).toThrow();
    },
  );

  it("accepts only the exact reauthentication request", () => {
    expect(
      accountSecurityReauthenticationSchema.parse({
        csrfToken: "csrf",
        locale: "es",
      }),
    ).toEqual({ csrfToken: "csrf", locale: "es" });

    for (const body of [
      { locale: "es" },
      { csrfToken: "", locale: "es" },
      { csrfToken: "csrf", locale: "fr" },
      { csrfToken: "csrf", locale: "es", action: "revoke" },
      { csrfToken: "csrf", locale: "es", confirmation: "revoke_session" },
      { csrfToken: "csrf", locale: "es", selector: "target" },
      { csrfToken: "csrf", locale: "es", sessionId: "target" },
      { csrfToken: "csrf", locale: "es", email: "other@example.test" },
      { csrfToken: "csrf", locale: "es", user: { id: "other" } },
      { csrfToken: "csrf", locale: "es", userId: "other" },
      { csrfToken: "csrf", locale: "es", token: "credential" },
      { csrfToken: "csrf", locale: "es", sessionToken: "credential" },
    ]) {
      expect(accountSecurityReauthenticationSchema.safeParse(body).success).toBe(
        false,
      );
    }
  });

  it("accepts only the exact individual revocation command", () => {
    expect(
      accountSecurityIndividualCommandSchema.parse({
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "revoke_session",
        sessionId: "opaque-selector",
      }),
    ).toEqual({
      csrfToken: "csrf",
      locale: "ca",
      confirmation: "revoke_session",
      sessionId: "opaque-selector",
    });

    for (const body of [
      {
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "revoke_session",
      },
      {
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "revoke",
        sessionId: "opaque-selector",
      },
      {
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "revoke_session",
        sessionId: "",
      },
      {
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "revoke_session",
        sessionId: "s".repeat(129),
      },
    ]) {
      expect(
        accountSecurityIndividualCommandSchema.safeParse(body).success,
      ).toBe(false);
    }
  });

  it.each([
    ["user", { id: "victim" }],
    ["userId", "victim"],
    ["email", "victim@example.test"],
    ["normalizedEmail", "victim@example.test"],
    ["token", "credential"],
    ["sessionToken", "credential"],
    ["current", true],
    ["ownership", "owned"],
    ["authorized", true],
  ] as const)("rejects the %s identity or authorization claim", (field, value) => {
    expect(
      accountSecurityIndividualCommandSchema.safeParse({
        csrfToken: "csrf",
        locale: "en",
        confirmation: "revoke_session",
        sessionId: "opaque-selector",
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it.each([
    "not-json",
    '{"csrfToken":"csrf","locale":"en","locale":"ca","confirmation":"revoke_session","sessionId":"target"}',
    '{"csrfToken":"csrf","locale":"en","confirmation":"revoke_session","sessionId":"first","sessionId":"second"}',
  ])("rejects malformed or duplicate-field JSON %j", (source) => {
    expect(parseAccountSecurityRequestBody(source)).toBeNull();
  });

  it("preserves an exact valid JSON body for strict schema validation", () => {
    expect(
      parseAccountSecurityRequestBody(
        '{"csrfToken":"csrf","locale":"es","confirmation":"revoke_session","sessionId":"target"}',
      ),
    ).toEqual({
      csrfToken: "csrf",
      locale: "es",
      confirmation: "revoke_session",
      sessionId: "target",
    });
  });

  it.each([
    [
      "en",
      "/account/security",
      "/login?callbackUrl=%2Faccount%2Fsecurity",
    ],
    [
      "es",
      "/es/account/security",
      "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity",
    ],
    [
      "ca",
      "/ca/account/security",
      "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity",
    ],
  ] as const)(
    "builds fixed identity-free %s paths",
    (locale, securityPath, loginPath) => {
      expect(getAccountSecurityPath(locale)).toBe(securityPath);
      expect(getAccountSecurityLoginPath(locale)).toBe(loginPath);
    },
  );

  it.each([
    ["reauthenticated", "/es/account/security?state=reauthenticated"],
    ["invalid_link", "/es/account/security?state=invalid_link"],
    ["session_conflict", "/es/account/security?state=session_conflict"],
  ] as const)("accepts and builds callback state %s", (state, expectedPath) => {
    expect(parseAccountSecurityCallbackState(state)).toBe(state);
    expect(getAccountSecurityCallbackPath("es", state)).toBe(expectedPath);
  });

  it.each([
    undefined,
    null,
    "",
    "revoke_session",
    "reauthenticated?sessionId=secret",
  ])("rejects callback state %j", (state) => {
    expect(parseAccountSecurityCallbackState(state)).toBeNull();
  });

  it("accepts only one canonical 32-byte Base64URL callback credential", () => {
    const rawToken = Buffer.alloc(32, 7).toString("base64url");

    expect(rawToken).toHaveLength(43);
    expect(
      parseAccountSecurityCallbackToken(new URLSearchParams({ token: rawToken })),
    ).toBe(rawToken);

    for (const query of [
      "",
      `token=${"a".repeat(42)}`,
      `token=${"a".repeat(44)}`,
      `token=${"a".repeat(42)}%3D`,
      `token=${"a".repeat(42)}%2B`,
      `token=${rawToken}&action=revoke_session`,
      `token=${rawToken}&sessionId=target`,
      `token=${rawToken}&email=person%40example.test`,
      `token=${rawToken}&userId=owner`,
      `token=${rawToken}&callbackUrl=%2Faccount%2Fsecurity`,
      `token=${rawToken}&token=${rawToken}`,
    ]) {
      expect(
        parseAccountSecurityCallbackToken(new URLSearchParams(query)),
      ).toBeNull();
    }
  });

  it.each([
    [
      "en",
      "/account/security?state=reauthenticated",
      "/account/security?state=recovered",
      "/login?callbackUrl=%2Faccount%2Fsecurity",
    ],
    [
      "es",
      "/es/account/security?state=reauthenticated",
      "/es/account/security?state=recovered",
      "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity",
    ],
    [
      "ca",
      "/ca/account/security?state=reauthenticated",
      "/ca/account/security?state=recovered",
      "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity",
    ],
  ] as const)(
    "builds credential-free callback, recovery, and login paths for %s",
    (locale, callbackPath, recoveryPath, loginPath) => {
      const paths = [
        getAccountSecurityCallbackPath(locale, "reauthenticated"),
        getAccountSecurityRecoveryPath(locale),
        getAccountSecurityLoginPath(locale),
      ];

      expect(paths).toEqual([callbackPath, recoveryPath, loginPath]);
      for (const path of paths) {
        expect(path).not.toMatch(
          /(?:token|email|user|sessionId|selector|action|confirmation)=/i,
        );
      }
    },
  );
});