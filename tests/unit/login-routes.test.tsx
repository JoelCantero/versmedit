// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callbackUrl: "",
  projectName: "Configured Project",
}));

const translations: Record<string, Record<string, string>> = {
  en: {
    "Login.heading.title": "Welcome back",
    "Login.recovery.invalidLink.title": "This sign-in link is not valid",
    "Login.page.metadata.title": "Sign in",
  },
  es: {
    "Login.heading.title": "Te damos la bienvenida de nuevo",
    "Login.recovery.invalidLink.title": "Este enlace de acceso no es válido",
    "Login.page.metadata.title": "Iniciar sesión",
  },
  ca: {
    "Login.heading.title": "Benvingut de nou",
    "Login.recovery.invalidLink.title": "Aquest enllaç d'accés no és vàlid",
    "Login.page.metadata.title": "Inicia la sessió",
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ PROJECT_NAME: mocks.projectName }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(({ locale, namespace }: { locale: string; namespace: string }) =>
    (key: string) => translations[locale]?.[`${namespace}.${key}`] ?? `${namespace}.${key}`,
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/modules/login/components/login-form", () => ({
  LoginForm: ({
    callbackUrl,
    title,
  }: {
    callbackUrl: string;
    title?: string;
  }) => {
    mocks.callbackUrl = callbackUrl;
    return (
      <div data-callback-url={callbackUrl}>
        {title ? <h1>{title}</h1> : null}
        mock-login-form
      </div>
    );
  },
}));

import LoginErrorPage from "@/app/[locale]/login/error/page";
import LoginPage, { generateMetadata } from "@/app/[locale]/login/page";

describe("localized login routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbackUrl = "";
  });

  it.each(["en", "es", "ca"])("renders login and recovery content for %s", async (locale) => {
    const loginHtml = renderToStaticMarkup(
      await LoginPage({ params: Promise.resolve({ locale }) }),
    );
    const errorHtml = renderToStaticMarkup(
      await LoginErrorPage({ params: Promise.resolve({ locale }) }),
    );
    expect(loginHtml).toContain(translations[locale]["Login.heading.title"]);
    expect(loginHtml).toContain(mocks.projectName);
    expect(errorHtml).toContain(mocks.projectName);
    expect(errorHtml.replaceAll("&#x27;", "'")).toContain(
      translations[locale]["Login.recovery.invalidLink.title"],
    );
    expect(errorHtml).toContain('href="/login"');
    expect(errorHtml).toContain('href="/"');
    expect(errorHtml).not.toMatch(/data-slot="(?:empty|tabs|sidebar)"/u);
  });

  it.each(["en", "es", "ca"])("localizes metadata for %s", async (locale) => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale }) }),
    ).resolves.toEqual(expect.objectContaining({
      title: translations[locale]["Login.page.metadata.title"],
    }));
  });

  it.each([
    ["en", "/account", "/account"],
    ["es", "/es/account", "/es/account"],
    ["ca", "/ca/account", "/ca/account"],
  ] as const)(
    "passes a validated callback path for %s",
    async (locale, callbackUrl, expected) => {
      renderToStaticMarkup(
        await LoginPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ callbackUrl }),
        }),
      );
      expect(mocks.callbackUrl).toBe(expected);
    },
  );

  it.each([
    ["en", "https://evil.example", "/"],
    ["es", "/ca/account", "/es"],
    ["ca", "/projects", "/ca"],
  ] as const)(
    "falls back to locale home for invalid callback path in %s",
    async (locale, callbackUrl, expected) => {
      renderToStaticMarkup(
        await LoginPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ callbackUrl }),
        }),
      );
      expect(mocks.callbackUrl).toBe(expected);
    },
  );
});