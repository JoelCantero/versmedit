// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { renderEmailPresentation } from "@/lib/email/presentation";
import {
  EmailBrandValidationError,
  validateEmailBrand,
} from "@/lib/email/presentation/brand";
import {
  EMAIL_LOCALES,
  EMAIL_VARIANTS,
} from "@/lib/email/presentation/constants";
import {
  EmailPresentationError,
  renderResolvedEmailContent,
  validateEmailPresentationRequest,
} from "@/lib/email/presentation/render";
import type {
  EmailBrand,
  EmailPresentationRequest,
  EmailVariant,
  LocalizedEmailCopy,
} from "@/lib/email/presentation/types";

const brand: EmailBrand = Object.freeze({
  productName: "Example Workspace",
  canonicalOrigin: "https://app.example.test",
  primaryColor: "#0057B8",
  actionForeground: "#FFFFFF",
  supportEmail: "support@example.test",
  logoUrl: null,
});

const copy: LocalizedEmailCopy = Object.freeze({
  subject: "Confirm your request",
  previewText: "Review your confirmation request.",
  heading: "Confirm your request",
  paragraphs: Object.freeze([
    "We received request {reference}.",
    "Use the secure action below to continue.",
  ]),
  actionLabel: "Confirm request",
  fallbackInstruction: "Or copy and paste this address into your browser:",
  supportLabel: "Questions? Contact",
  termsLabel: "Terms of Use",
  privacyLabel: "Privacy Notice",
  legalLabel: "Sent by",
});

const request: EmailPresentationRequest = Object.freeze({
  variant: "genericConfirmation",
  locale: "en",
  brand,
  actionUrl:
    "https://preview.example.test/confirm?token=opaque%26value&next=%2Faccount",
  reference: "CASE-1234",
});

const operationalVariants = [
  "loginMagicLink",
  "signupActivation",
  "existingAccountSignupNotice",
  "accountDeletionReauthentication",
  "accountSecurityReauthentication",
  "personalDataExportConfirmation",
] as const satisfies readonly EmailVariant[];

type OperationalVariant = (typeof operationalVariants)[number];

const operationalHeadings = {
  en: {
    loginMagicLink: "Sign in to",
    signupActivation: "Complete your signup",
    existingAccountSignupNotice: "An account already exists",
    accountDeletionReauthentication: "Continue account deletion",
    accountSecurityReauthentication: "Return to Account Security",
    personalDataExportConfirmation: "Confirm your data export",
  },
  es: {
    loginMagicLink: "Inicia sesión en",
    signupActivation: "Completa tu registro",
    existingAccountSignupNotice: "Ya existe una cuenta",
    accountDeletionReauthentication: "Continúa con la eliminación de la cuenta",
    accountSecurityReauthentication: "Vuelve a Seguridad de la cuenta",
    personalDataExportConfirmation: "Confirma tu exportación de datos",
  },
  ca: {
    loginMagicLink: "Inicia sessió a",
    signupActivation: "Completa el teu registre",
    existingAccountSignupNotice: "Ja existeix un compte",
    accountDeletionReauthentication: "Continua amb l'eliminació del compte",
    accountSecurityReauthentication: "Torna a Seguretat del compte",
    personalDataExportConfirmation: "Confirma l'exportació de dades",
  },
} as const;

const operationalLocaleCopy = {
  en: {
    support: "Questions? Contact",
    terms: "Terms of Use",
    privacy: "Privacy Notice",
    legal: "Sent by",
    forbidden: ["¿Tienes preguntas?", "Tens preguntes?"],
  },
  es: {
    support: "¿Tienes preguntas? Contacta con",
    terms: "Términos de uso",
    privacy: "Aviso de privacidad",
    legal: "Enviado por",
    forbidden: ["Questions? Contact", "Tens preguntes?"],
  },
  ca: {
    support: "Tens preguntes? Contacta amb",
    terms: "Condicions d'ús",
    privacy: "Avís de privacitat",
    legal: "Enviat per",
    forbidden: ["Questions? Contact", "¿Tienes preguntas?"],
  },
} as const;

function createOperationalBrand(logoUrl: string | null): EmailBrand {
  return validateEmailBrand({
    productName: `Example & <Workspace> ${"X".repeat(30)}`,
    canonicalOrigin: "https://app.example.test",
    primaryColor: "#0057B8",
    supportEmail: "support@example.test",
    logoUrl,
  });
}

function operationalActionUrl(
  variant: OperationalVariant,
  locale: EmailPresentationRequest["locale"],
): string {
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const opaque = `opaque-${variant}-%26-value`;

  switch (variant) {
    case "loginMagicLink":
      return `https://app.example.test/api/auth/callback/email?token=${opaque}&callbackUrl=${encodeURIComponent(`${localePrefix}/account`)}`;
    case "signupActivation":
      return `https://app.example.test/api/signup/activate?token=${opaque}`;
    case "existingAccountSignupNotice":
      return `https://app.example.test${localePrefix}/login`;
    case "accountDeletionReauthentication":
      return `https://app.example.test/api/account/deletion/verify?token=${opaque}`;
    case "accountSecurityReauthentication":
      return `https://app.example.test/api/account/security/verify?token=${opaque}`;
    case "personalDataExportConfirmation":
      return `https://app.example.test/api/account/data-export/verify?token=${opaque}&locale=${locale}`;
  }
}

const operationalCases = EMAIL_LOCALES.flatMap((locale, localeIndex) =>
  operationalVariants.map((variant, variantIndex) => {
    const logoUrl =
      (localeIndex * operationalVariants.length + variantIndex) % 2 === 0
        ? "https://assets.example.test/mail/logo-wide.png?v=1"
        : null;
    const caseBrand = createOperationalBrand(logoUrl);
    return {
      locale,
      variant,
      brand: caseBrand,
      actionUrl: operationalActionUrl(variant, locale),
      heading: operationalHeadings[locale][variant],
      copy: operationalLocaleCopy[locale],
    };
  }),
);

const futureVariants = [
  "personalDataExportReady",
  "accountDeleted",
  "emailChangeRequested",
  "emailChanged",
  "securityAlert",
  "genericConfirmation",
] as const satisfies readonly EmailVariant[];

type FutureVariant = (typeof futureVariants)[number];

const futureHeadings = {
  en: {
    personalDataExportReady: "Your data export is ready",
    accountDeleted: "Your account was deleted",
    emailChangeRequested: "Confirm your email change",
    emailChanged: "Your email was changed",
    securityAlert: "Review a security alert",
    genericConfirmation: "Confirm your request",
  },
  es: {
    personalDataExportReady: "Tu exportación de datos está lista",
    accountDeleted: "Tu cuenta se ha eliminado",
    emailChangeRequested: "Confirma el cambio de correo",
    emailChanged: "Tu correo ha cambiado",
    securityAlert: "Revisa una alerta de seguridad",
    genericConfirmation: "Confirma tu solicitud",
  },
  ca: {
    personalDataExportReady: "La teva exportació de dades està a punt",
    accountDeleted: "El teu compte s'ha eliminat",
    emailChangeRequested: "Confirma el canvi de correu",
    emailChanged: "El teu correu ha canviat",
    securityAlert: "Revisa una alerta de seguretat",
    genericConfirmation: "Confirma la teva sol·licitud",
  },
} as const;

const actionBearingFutureVariants = new Set<FutureVariant>([
  "personalDataExportReady",
  "emailChangeRequested",
  "securityAlert",
  "genericConfirmation",
]);

function createFutureRequest(
  variant: FutureVariant,
  locale: EmailPresentationRequest["locale"],
  caseBrand: EmailBrand,
): EmailPresentationRequest {
  const actionUrl =
    `https://preview.example.test/${locale}/${variant}` +
    "?token=fictional%26opaque&next=%2Faccount";

  switch (variant) {
    case "personalDataExportReady":
      return { variant, locale, brand: caseBrand, actionUrl };
    case "accountDeleted":
      return { variant, locale, brand: caseBrand };
    case "emailChangeRequested":
      return {
        variant,
        locale,
        brand: caseBrand,
        actionUrl,
        newEmail: `${"requested".repeat(8)}@example.test`,
      };
    case "emailChanged":
      return {
        variant,
        locale,
        brand: caseBrand,
        newEmail: `${"changed".repeat(9)}@example.test`,
      };
    case "securityAlert":
      return {
        variant,
        locale,
        brand: caseBrand,
        actionUrl,
        occurredAt: "2026-08-25T14:30:00.000Z",
      };
    case "genericConfirmation":
      return {
        variant,
        locale,
        brand: caseBrand,
        actionUrl,
        reference: `CASE-"'<>&-${"R".repeat(40)}`,
      };
  }
}

const futureCases = EMAIL_LOCALES.flatMap((locale, localeIndex) =>
  futureVariants.map((variant, variantIndex) => {
    const logoUrl =
      (localeIndex * futureVariants.length + variantIndex) % 2 === 0
        ? "https://assets.example.test/mail/logo-wide.png?v=1"
        : null;
    const caseBrand = createOperationalBrand(logoUrl);
    return {
      locale,
      variant,
      brand: caseBrand,
      request: createFutureRequest(variant, locale, caseBrand),
      heading: futureHeadings[locale][variant],
      copy: operationalLocaleCopy[locale],
      hasAction: actionBearingFutureVariants.has(variant),
    };
  }),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email brand validation", () => {
  const brandInput = {
    productName: "  Example Workspace  ",
    canonicalOrigin: "https://app.example.test/",
    primaryColor: "#0057b8",
    supportEmail: "  support@example.test  ",
    logoUrl: "  https://assets.example.test/mail/logo.png?v=1  ",
  };

  it("normalizes one immutable deployment-wide brand", () => {
    const validated = validateEmailBrand(brandInput);

    expect(validated).toEqual({
      productName: "Example Workspace",
      canonicalOrigin: "https://app.example.test",
      primaryColor: "#0057B8",
      actionForeground: "#FFFFFF",
      supportEmail: "support@example.test",
      logoUrl: "https://assets.example.test/mail/logo.png?v=1",
    });
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it("selects whichever black/white action foreground has greater contrast", () => {
    expect(
      validateEmailBrand({ ...brandInput, primaryColor: "#FFFFFF" })
        .actionForeground,
    ).toBe("#000000");
    expect(
      validateEmailBrand({ ...brandInput, primaryColor: "#000000" })
        .actionForeground,
    ).toBe("#FFFFFF");
  });

  it.each([
    ["productName", { productName: "unsafe\nname" }],
    ["canonicalOrigin", { canonicalOrigin: "https://user@app.example.test" }],
    ["canonicalOrigin", { canonicalOrigin: "https://app.example.test/path" }],
    ["primaryColor", { primaryColor: "#123" }],
    ["supportEmail", { supportEmail: "Display <support@example.test>" }],
    ["logoUrl", { logoUrl: "http://assets.example.test/logo.png" }],
    ["logoUrl", { logoUrl: "https://assets.example.test/logo.png#fragment" }],
    ["brand", { legalAddress: "Legacy postal address" }],
    ["brand", { recipient: "person@example.test" }],
  ])("rejects invalid %s without exposing its value", (field, replacement) => {
    const invalid = { ...brandInput, ...replacement };

    expect(() => validateEmailBrand(invalid)).toThrow(
      expect.objectContaining<Partial<EmailBrandValidationError>>({
        field: field as EmailBrandValidationError["field"],
      }),
    );
    try {
      validateEmailBrand(invalid);
    } catch (error) {
      for (const value of Object.values(replacement)) {
        if (String(value) !== "") {
          expect(String(error)).not.toContain(String(value));
        }
      }
    }
  });

  it.each([undefined, null, "", "   "])(
    "normalizes an absent logo value %j to null",
    (logoUrl) => {
      expect(validateEmailBrand({ ...brandInput, logoUrl }).logoUrl).toBeNull();
    },
  );
});

describe("email presentation shared contract", () => {
  it("keeps the supported locale and variant sets closed and ordered", () => {
    expect(EMAIL_LOCALES).toEqual(["en", "es", "ca"]);
    expect(EMAIL_VARIANTS).toEqual([
      "loginMagicLink",
      "signupActivation",
      "existingAccountSignupNotice",
      "accountDeletionReauthentication",
      "accountSecurityReauthentication",
      "personalDataExportConfirmation",
      "personalDataExportReady",
      "accountDeleted",
      "emailChangeRequested",
      "emailChanged",
      "securityAlert",
      "genericConfirmation",
    ]);
  });

  it("returns exactly subject, complete HTML, and deterministic plain text", async () => {
    const rendered = await renderResolvedEmailContent(request, copy);

    expect(Object.keys(rendered).sort()).toEqual(["html", "subject", "text"]);
    expect(rendered.subject).toBe(copy.subject);
    expect(rendered.html).toMatch(/<!doctype html/i);
    expect(rendered.html).toContain("Example Workspace");
    expect(rendered.html).toContain("Confirm your request");
    expect(rendered.text).toMatch(/Confirm your request/i);
    expect(rendered.html).not.toContain("undefined");
    expect(rendered.text).not.toMatch(/\{[^}]+\}/);
    for (const declaration of [
      "border-radius:10px",
      "font-size:14px",
      "font-weight:500",
      "line-height:20px",
    ]) {
      expect(rendered.html).toContain(declaration);
    }
  });

  it("accepts only the structured values declared by the discriminated variant", () => {
    expect(validateEmailPresentationRequest(request)).toEqual(request);

    expect(() =>
      validateEmailPresentationRequest({
        ...request,
        subject: "Caller-controlled subject",
      }),
    ).toThrow(
      expect.objectContaining<Partial<EmailPresentationError>>({
        code: "INVALID_INPUT",
        field: "subject",
      }),
    );
    expect(() =>
      validateEmailPresentationRequest({
        variant: "accountDeleted",
        locale: "en",
        brand,
        actionUrl: request.actionUrl,
      }),
    ).toThrow(
      expect.objectContaining<Partial<EmailPresentationError>>({
        code: "INVALID_INPUT",
        field: "actionUrl",
      }),
    );
  });

  it.each([
    ["relative URL", "/confirm", "actionUrl"],
    ["executable scheme", "javascript:alert(1)", "actionUrl"],
    ["credentials in authority", "https://user@example.test/confirm", "actionUrl"],
    ["non-fictional preview host", "https://production.invalid/confirm", "actionUrl"],
  ])("rejects an invalid %s without exposing it", (_case, actionUrl, field) => {
    expect(() =>
      validateEmailPresentationRequest({ ...request, actionUrl }),
    ).toThrow(
      expect.objectContaining<Partial<EmailPresentationError>>({
        code: "INVALID_INPUT",
        field,
      }),
    );

    try {
      validateEmailPresentationRequest({ ...request, actionUrl });
    } catch (error) {
      expect(String(error)).not.toContain(actionUrl);
    }
  });

  it("requires the existing-account notice to use only its locale-aware login URL", () => {
    const notice = {
      variant: "existingAccountSignupNotice",
      locale: "es",
      brand,
      actionUrl: "https://app.example.test/es/login",
    } satisfies EmailPresentationRequest;

    expect(validateEmailPresentationRequest(notice)).toEqual(notice);
    expect(() =>
      validateEmailPresentationRequest({
        ...notice,
        actionUrl: "https://app.example.test/es/login?token=unsafe",
      }),
    ).toThrow(
      expect.objectContaining<Partial<EmailPresentationError>>({
        code: "INVALID_INPUT",
        field: "actionUrl",
      }),
    );
  });

  it("escapes dynamic text and preserves one complex action destination", async () => {
    const unsafeReference = `CASE-\"'<>&${"x".repeat(60)}`;
    const rendered = await renderResolvedEmailContent(
      { ...request, reference: unsafeReference },
      copy,
    );

    expect(rendered.html).not.toContain(unsafeReference);
    expect(rendered.html).not.toContain("<script");
    expect(rendered.html).toContain("CASE-&quot;&#x27;&lt;&gt;&amp;");
    expect(rendered.text).toContain(unsafeReference);
    expect(rendered.html).toContain(
      "https://preview.example.test/confirm?token=opaque%26value&amp;next=%2Faccount",
    );
    expect(rendered.text).toContain(request.actionUrl);
  });

  it("keeps action, support, and legal destinations in HTML/text parity", async () => {
    const rendered = await renderResolvedEmailContent(request, copy);
    const destinations = [
      request.actionUrl,
      "https://app.example.test/terms",
      "https://app.example.test/privacy",
    ];

    for (const destination of destinations) {
      expect(rendered.html.replaceAll("&amp;", "&")).toContain(destination);
      expect(rendered.text).toContain(destination);
    }
    expect(rendered.html).toContain("mailto:support@example.test");
    expect(rendered.text).toContain("support@example.test");
    expect(rendered.html).not.toContain("token=opaque%26value/terms");
    expect(rendered.html).not.toContain("token=opaque%26value/privacy");
  });

  it("is deterministic, does not mutate input, and performs no I/O or logging", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const requestBefore = structuredClone(request);
    const copyBefore = structuredClone(copy);

    const first = await renderResolvedEmailContent(request, copy);
    const second = await renderResolvedEmailContent(request, copy);

    expect(second).toEqual(first);
    expect(request).toEqual(requestBefore);
    expect(copy).toEqual(copyBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each(operationalCases)(
    "renders complete branded $locale/$variant content with one business destination",
    async ({ locale, variant, brand: caseBrand, actionUrl, heading, copy: localeCopy }) => {
      const rendered = await renderEmailPresentation({
        variant,
        locale,
        brand: caseBrand,
        actionUrl,
      });
      const normalizedHtml = rendered.html.replaceAll("&amp;", "&");
      const combined = `${rendered.subject}\n${normalizedHtml}\n${rendered.text}`;

      expect(rendered.subject.trim()).not.toBe("");
      expect(normalizedHtml).toMatch(/<!doctype html/i);
      expect(normalizedHtml).toMatch(
        new RegExp(`<html[^>]*lang="${locale}"`, "iu"),
      );
      expect(rendered.text.trim()).not.toBe("");
      expect(combined).toContain(heading);
      expect(combined).toContain(localeCopy.support);
      expect(combined).toContain(localeCopy.terms);
      expect(combined).toContain(localeCopy.privacy);
      expect(combined).toContain(localeCopy.legal);
      expect(combined).not.toContain("undefined");
      expect(combined).not.toMatch(/\{[^}]+\}/u);
      for (const foreignMarker of localeCopy.forbidden) {
        expect(combined).not.toContain(foreignMarker);
      }

      const businessDestinations = [
        ...normalizedHtml.matchAll(/href="([^"]+)"/gu),
      ]
        .map((match) => match[1])
        .filter((destination) => destination === actionUrl);
      expect(new Set(businessDestinations)).toEqual(new Set([actionUrl]));
      expect(rendered.text.match(new RegExp(escapeRegExp(actionUrl), "gu"))).toHaveLength(1);
      expect(rendered.html).toContain("Example &amp; &lt;Workspace&gt;");
      expect(rendered.html).not.toContain("<Workspace>");
      expect(rendered.text).toContain(caseBrand.productName);

      if (caseBrand.logoUrl) {
        expect(normalizedHtml).toContain(`src="${caseBrand.logoUrl.replace("&", "&amp;")}"`);
        expect(rendered.html).toContain(`alt="${caseBrand.productName.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")} logo"`);
      } else {
        expect(normalizedHtml).not.toContain("<img");
      }

      if (variant === "existingAccountSignupNotice") {
        expect(actionUrl).toBe(
          `https://app.example.test${locale === "en" ? "" : `/${locale}`}/login`,
        );
        expect(combined).not.toMatch(/token=|\/api\/signup\/activate|verification/i);
      }
    },
  );

  it.each(futureCases)(
    "renders complete presentation-only $locale/$variant content",
    async ({ brand: caseBrand, request: futureRequest, heading, copy: localeCopy, hasAction }) => {
      const rendered = await renderEmailPresentation(futureRequest);
      const normalizedHtml = rendered.html.replaceAll("&amp;", "&");
      const combined = `${rendered.subject}\n${normalizedHtml}\n${rendered.text}`;

      expect(rendered.subject.trim()).not.toBe("");
      expect(rendered.html).toMatch(/<!doctype html/i);
      expect(rendered.text.trim()).not.toBe("");
      expect(combined.toLocaleLowerCase()).toContain(
        heading.toLocaleLowerCase(),
      );
      expect(combined).toContain(localeCopy.support);
      expect(combined).toContain(localeCopy.terms);
      expect(combined).toContain(localeCopy.privacy);
      expect(combined).toContain(localeCopy.legal);
      expect(combined).not.toContain("undefined");
      expect(combined).not.toMatch(/\{[^}]+\}/u);
      for (const foreignMarker of localeCopy.forbidden) {
        expect(combined).not.toContain(foreignMarker);
      }

      if (hasAction && "actionUrl" in futureRequest) {
        const destinations = [
          ...normalizedHtml.matchAll(/href="([^"]+)"/gu),
        ]
          .map((match) => match[1])
          .filter((destination) => destination === futureRequest.actionUrl);
        expect(new Set(destinations)).toEqual(
          new Set([futureRequest.actionUrl]),
        );
        expect(
          rendered.text.match(
            new RegExp(escapeRegExp(futureRequest.actionUrl), "gu"),
          ),
        ).toHaveLength(1);
        expect(rendered.html).toContain('data-primary-action="true"');
      } else {
        expect(rendered.html).not.toContain("data-primary-action");
        expect(rendered.text).not.toContain("preview.example.test");
      }

      if ("newEmail" in futureRequest) {
        expect(rendered.text).toContain(futureRequest.newEmail);
        expect(rendered.html).toContain(futureRequest.newEmail);
      }
      if ("reference" in futureRequest) {
        expect(rendered.text).toContain(futureRequest.reference);
        expect(rendered.html).not.toContain(futureRequest.reference);
        expect(rendered.html).toContain("CASE-&quot;&#x27;&lt;&gt;&amp;");
      }

      expect(rendered.text).toContain(caseBrand.productName);
      if (caseBrand.logoUrl) {
        expect(rendered.html).toContain(caseBrand.logoUrl.replace("&", "&amp;"));
      } else {
        expect(rendered.html).not.toContain("<img");
      }
    },
  );

  it.each([
    ["subject", "Caller subject"],
    ["previewText", "Caller preview"],
    ["heading", "Caller heading"],
    ["body", "Caller body"],
    ["paragraphs", ["Caller paragraph"]],
    ["actionLabel", "Caller action"],
    ["html", "<p>Caller HTML</p>"],
    ["text", "Caller text"],
  ])("rejects caller-provided generic-confirmation %s", async (field, value) => {
    const genericRequest = createFutureRequest(
      "genericConfirmation",
      "en",
      brand,
    );

    await expect(
      renderEmailPresentation({ ...genericRequest, [field]: value }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});