import { describe, expect, it } from "vitest";

import {
  getAccountPathForLocale,
  getHomePathForLocale,
  parseLoginEmail,
  parseLoginCallbackPath,
  parseLoginLocale,
} from "@/modules/login/schema";

describe("login schema", () => {
  it("trims and lowercases a valid email", () => {
    expect(parseLoginEmail("  Person.Name@Example.COM ")).toBe(
      "person.name@example.com",
    );
  });

  it("accepts an email whose total length is 254 characters", () => {
    const email = `${"a".repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect(parseLoginEmail(email)).toBe(email);
  });

  it.each(["", "not-an-email", `${"a".repeat(243)}@example.com`, 42])(
    "rejects invalid email input %j",
    (email) => {
      expect(() => parseLoginEmail(email)).toThrow();
    },
  );

  it.each(["en", "es", "ca"] as const)("accepts locale %s", (locale) => {
    expect(parseLoginLocale(locale)).toBe(locale);
  });

  it.each(["fr", "", null])("rejects unsupported locale %j", (locale) => {
    expect(() => parseLoginLocale(locale)).toThrow();
  });

  it.each([
    ["en", "/account"],
    ["en", "/account/security"],
    ["es", "/es/account"],
    ["es", "/es/account/security"],
    ["ca", "/ca/account"],
    ["ca", "/ca/account/security"],
  ] as const)("accepts a locale-matched callback path for %s", (locale, callbackPath) => {
    expect(parseLoginCallbackPath(locale, callbackPath)).toBe(callbackPath);
  });

  it.each([
    ["en", "https://evil.example/path"],
    ["en", "//evil.example/path"],
    ["en", "%2F%2Fevil.example%2Fpath"],
    ["en", "not/a/path"],
    ["en", "/projects"],
    ["en", "/es/account"],
    ["en", "/es/account/security"],
    ["en", "/account/security?state=reauthenticated"],
    ["en", "/account/security#reauthenticated"],
    ["en", "/account/security/sessions"],
    ["es", "/account"],
    ["es", "/account/security"],
    ["es", "/es/account/security?state=reauthenticated"],
    ["es", "/es/account/security#reauthenticated"],
    ["es", "/es/account/security/sessions"],
    ["ca", "/es/account"],
    ["ca", "/es/account/security"],
    ["ca", "/ca/account/security?state=reauthenticated"],
    ["ca", "/ca/account/security#reauthenticated"],
    ["ca", "/ca/account/security/sessions"],
  ] as const)(
    "rejects callback path %s for locale %s",
    (locale, callbackPath) => {
      expect(parseLoginCallbackPath(locale, callbackPath)).toBe(
        getHomePathForLocale(locale),
      );
    },
  );

  it.each(["en", "es", "ca"] as const)(
    "builds locale account path for %s",
    (locale) => {
      const path = getAccountPathForLocale(locale);
      expect(path).toMatch(/\/account$/);
    },
  );
});