// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import {
  buildActiveAccountEmail,
  buildOnboardingEmail,
} from "@/modules/signup/email";
import { getPolicyDestinations } from "@/modules/signup/policy";

const catalogs = {
  en: enMessages,
  es: esMessages,
  ca: caMessages,
} as const;

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function interpolationMap(value: unknown, prefix = ""): Record<string, string[]> {
  if (typeof value === "string") {
    return {
      [prefix]: [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!).sort(),
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(interpolationMap(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

describe("signup message catalogs", () => {
  it("keeps every signup and policy key in parity across supported locales", () => {
    const expectedKeys = leafKeys({
      Signup: enMessages.Signup,
      Policies: enMessages.Policies,
    }).sort();

    for (const locale of ["es", "ca"] as const) {
      expect(
        leafKeys({
          Signup: catalogs[locale].Signup,
          Policies: catalogs[locale].Policies,
        }).sort(),
      ).toEqual(expectedKeys);
    }
  });

  it("keeps translated interpolation parameters in parity", () => {
    const expected = interpolationMap({
      Signup: enMessages.Signup,
      Policies: enMessages.Policies,
    });
    for (const locale of ["es", "ca"] as const) {
      expect(
        interpolationMap({
          Signup: catalogs[locale].Signup,
          Policies: catalogs[locale].Policies,
        }),
      ).toEqual(expected);
    }
    expect(expected["Signup.states.rateLimited"]).toEqual(["seconds"]);
    expect(expected["Signup.email.onboarding.subject"]).toEqual(["projectName"]);
    expect(expected["Signup.email.activeAccount.subject"]).toEqual(["projectName"]);
    expect(expected["Policies.versionLabel"]).toEqual(["version"]);
  });

  it.each([
    ["en", "/terms", "/privacy"],
    ["es", "/es/terms", "/es/privacy"],
    ["ca", "/ca/terms", "/ca/privacy"],
  ] as const)("uses localized policy destinations for %s", (locale, terms, privacy) => {
    expect(getPolicyDestinations(locale)).toEqual({ terms, privacy });
  });

  it.each(["en", "es", "ca"] as const)(
    "builds %s onboarding and active-account email from that locale only",
    (locale) => {
      const recipient = "person@example.test";
      const projectName = "versmedit";
      const onboarding = buildOnboardingEmail(
        {
          recipient,
          rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFGH012345678",
          locale,
          origin: "https://app.example.test",
        },
        projectName,
      );
      const active = buildActiveAccountEmail(
        {
          recipient,
          locale,
          origin: "https://app.example.test",
        },
        projectName,
      );
      const copy = catalogs[locale].Signup.email;

      expect(onboarding.subject).toBe(
        copy.onboarding.subject.replace("{projectName}", projectName),
      );
      expect(onboarding.text).toContain(copy.onboarding.intro);
      expect(onboarding.text).toContain(copy.onboarding.action);
      expect(active.subject).toBe(
        copy.activeAccount.subject.replace("{projectName}", projectName),
      );
      expect(active.text).toContain(copy.activeAccount.intro);
      expect(active.text).toContain(copy.activeAccount.action);
      expect(active.text).toContain(
        locale === "en" ? "/login" : `/${locale}/login`,
      );
    },
  );

  it("contains no English signup fallback in Spanish or Catalan surfaces", () => {
    const englishOnly = [
      enMessages.Signup.heading.title,
      enMessages.Signup.states.accepted,
      enMessages.Signup.recovery.invalidLink.title,
      enMessages.Signup.email.onboarding.intro,
    ];
    for (const locale of ["es", "ca"] as const) {
      const serialized = JSON.stringify(catalogs[locale].Signup);
      for (const phrase of englishOnly) expect(serialized).not.toContain(phrase);
    }
  });
});