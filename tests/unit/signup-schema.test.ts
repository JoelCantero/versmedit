import { describe, expect, it } from "vitest";

import {
  parseSignupClientInput,
  parseSignupRequest,
} from "@/modules/signup/schema";

const validRequest = {
  name: "  José O’Neil-Smith  ",
  email: "  Person.Name@Example.COM  ",
  policyAccepted: true,
  locale: "en",
  csrfToken: "csrf-token",
};

describe("signup schema", () => {
  it("normalizes a Unicode name and email in an exact server request", () => {
    expect(parseSignupRequest(validRequest)).toEqual({
      name: "José O’Neil-Smith",
      email: "person.name@example.com",
      policyAccepted: true,
      locale: "en",
      csrfToken: "csrf-token",
    });
  });

  it("accepts the exact name and email boundaries", () => {
    const email = `${"a".repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect(
      parseSignupRequest({
        ...validRequest,
        name: "É".repeat(80),
        email,
      }),
    ).toMatchObject({ name: "É".repeat(80), email });
  });

  it.each([
    ["", "name"],
    [" ", "name"],
    ["A".repeat(81), "name"],
    ["Name3", "name"],
    ["not-an-email", "email"],
    [`${"a".repeat(243)}@example.com`, "email"],
    [42, "email"],
  ])("rejects invalid %s input for %s", (value, field) => {
    expect(() =>
      parseSignupRequest({ ...validRequest, [field]: value }),
    ).toThrow();
  });

  it.each([false, undefined, "true"])(
    "requires affirmative native policy acceptance (%j)",
    (policyAccepted) => {
      expect(() =>
        parseSignupRequest({ ...validRequest, policyAccepted }),
      ).toThrow();
    },
  );

  it.each(["en", "es", "ca"] as const)("accepts locale %s", (locale) => {
    expect(parseSignupRequest({ ...validRequest, locale }).locale).toBe(locale);
  });

  it.each(["fr", "", null])("rejects unsupported locale %j", (locale) => {
    expect(() => parseSignupRequest({ ...validRequest, locale })).toThrow();
  });

  it.each([
    { termsVersion: "client-version" },
    { privacyVersion: "client-version" },
    { acceptedAt: "2026-08-18T00:00:00Z" },
    { unexpected: true },
  ])("rejects additional client metadata %#", (additionalField) => {
    expect(() =>
      parseSignupRequest({ ...validRequest, ...additionalField }),
    ).toThrow();
  });

  it("uses the same name, email, and acceptance contract on the client", () => {
    expect(
      parseSignupClientInput({
        name: validRequest.name,
        email: validRequest.email,
        policyAccepted: true,
      }),
    ).toEqual({
      name: "José O’Neil-Smith",
      email: "person.name@example.com",
      policyAccepted: true,
    });
    expect(() =>
      parseSignupClientInput({
        name: "Taylor",
        email: "taylor@example.test",
        policyAccepted: true,
        termsVersion: "client-version",
      }),
    ).toThrow();
  });
});