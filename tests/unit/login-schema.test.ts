import { describe, expect, it } from "vitest";

import {
  parseLoginEmail,
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
});