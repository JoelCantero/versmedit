// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import { validateEmailBrand } from "@/lib/email/presentation/brand";
import { EMAIL_LOCALES } from "@/lib/email/presentation/constants";
import {
  EmailPresentationError,
  renderEmailPresentation,
} from "@/lib/email/presentation/render";
import { LOGIN_CODE_ALPHABET } from "@/modules/login/code";

const CODE = "7K2QM9XPTR";
const PRODUCT_NAME = "Versmedit";

const brand = validateEmailBrand({
  productName: PRODUCT_NAME,
  canonicalOrigin: "https://app.example.test",
  primaryColor: "#0057B8",
  supportEmail: "support@example.test",
  logoUrl: "https://assets.example.test/mail/logo.png",
});

const catalogs = {
  en: enMessages.Email.loginMagicLink,
  es: esMessages.Email.loginMagicLink,
  ca: caMessages.Email.loginMagicLink,
} as const;

function actionUrl(locale: string) {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `https://app.example.test/api/auth/callback/email?token=opaque-token&callbackUrl=${encodeURIComponent(`${prefix}/account`)}`;
}

function resolve(value: string) {
  return value.replaceAll("{productName}", PRODUCT_NAME);
}

function decode(value: string) {
  return value
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#183;", "·");
}

describe("login email carries the access code in every locale", () => {
  it.each(EMAIL_LOCALES)(
    "renders the %s subject, heading, action, validity and code in HTML and plain text",
    async (locale) => {
      const copy = catalogs[locale];

      const rendered = await renderEmailPresentation({
        variant: "loginMagicLink",
        locale,
        brand,
        actionUrl: actionUrl(locale),
        verificationCode: CODE,
      });

      expect(rendered.subject).toBe(resolve(copy.subject));
      for (const body of [decode(rendered.html), decode(rendered.text)]) {
        // The plain-text renderer upper-cases headings, so compare case-insensitively.
        const normalized = body.toLowerCase();
        expect(normalized).toContain(resolve(copy.heading).toLowerCase());
        expect(normalized).toContain(resolve(copy.actionLabel).toLowerCase());
        expect(normalized).toContain(
          resolve(copy.fallbackInstruction).toLowerCase(),
        );
        expect(body).toContain(CODE);
        expect(normalized).toContain(PRODUCT_NAME.toLowerCase());
      }
      // The magic link must survive for text-only clients.
      expect(rendered.text).toContain("/api/auth/callback/email");
    },
  );

  it.each(EMAIL_LOCALES)(
    "keeps the %s bodies free of the other locales' wording",
    async (locale) => {
      const rendered = await renderEmailPresentation({
        variant: "loginMagicLink",
        locale,
        brand,
        actionUrl: actionUrl(locale),
        verificationCode: CODE,
      });

      for (const other of EMAIL_LOCALES) {
        if (other === locale) continue;
        expect(rendered.subject).not.toBe(resolve(catalogs[other].subject));
      }
    },
  );

  it.each([
    ["a code that is too short", CODE.slice(0, 9)],
    ["a code that is too long", `${CODE}A`],
    ["an excluded letter", "7K2QM9XPTO"],
    ["lower case", CODE.toLowerCase()],
    ["padding", ` ${CODE} `],
    ["a non-string", 1234567890],
  ])("rejects %s", async (_label, verificationCode) => {
    await expect(
      renderEmailPresentation({
        variant: "loginMagicLink",
        locale: "en",
        brand,
        actionUrl: actionUrl("en"),
        verificationCode,
      }),
    ).rejects.toThrow(EmailPresentationError);
  });

  it("only ever emits characters from the published alphabet", async () => {
    const rendered = await renderEmailPresentation({
      variant: "loginMagicLink",
      locale: "en",
      brand,
      actionUrl: actionUrl("en"),
      verificationCode: CODE,
    });

    for (const character of CODE) {
      expect(LOGIN_CODE_ALPHABET).toContain(character);
    }
    expect(rendered.text).toMatch(/^7K2QM9XPTR$/m);
  });
});

describe("stated validity matches the enforced challenge lifetime", () => {
  it.each(EMAIL_LOCALES)(
    "states the enforced number of minutes in %s",
    async (locale) => {
      const { LOGIN_CHALLENGE_MAX_AGE_SECONDS } = await import("@/lib/auth");
      const expectedMinutes = LOGIN_CHALLENGE_MAX_AGE_SECONDS / 60;
      const instruction = catalogs[locale].fallbackInstruction;

      const stated = instruction.match(/(\d+)\s+minut/u)?.[1];

      expect(stated, `no minute count found in the ${locale} copy`).toBeDefined();
      expect(Number(stated)).toBe(expectedMinutes);
    },
  );

  it("never claims the old fifteen-minute window anywhere in the login copy", () => {
    for (const locale of EMAIL_LOCALES) {
      const copy = JSON.stringify(catalogs[locale]);
      expect(copy).not.toMatch(/15\s+minut/u);
    }
  });
});
