import { renderToStaticMarkup } from "react-dom/server";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import { POLICY_PATHS } from "@/modules/signup/policy";

const catalogs = {
  en: enMessages,
  es: esMessages,
  ca: caMessages,
} as const;

const mocks = vi.hoisted(() => ({ getTranslations: vi.fn() }));

vi.mock("next-intl/server", () => ({
  getTranslations: mocks.getTranslations,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { AppFooter } from "@/components/app-footer";

type Locale = keyof typeof catalogs;
type Namespace = "Footer" | "Policies";

function getMessage(locale: Locale, namespace: Namespace, key: string) {
  let value: unknown = catalogs[locale];

  for (const segment of [namespace, ...key.split(".")]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Missing message ${namespace}.${key} for ${locale}`);
    }
    value = (value as Record<string, unknown>)[segment];
  }

  if (typeof value !== "string") {
    throw new Error(`Message ${namespace}.${key} for ${locale} is not a string`);
  }

  return value;
}

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function installTranslations() {
  mocks.getTranslations.mockImplementation(
    async ({ locale, namespace }: { locale: Locale; namespace: Namespace }) =>
      (key: string) => getMessage(locale, namespace, key),
  );
}

async function renderFooter(locale: Locale) {
  document.body.innerHTML = renderToStaticMarkup(
    await AppFooter({ locale, supportEmail: "support@example.test" }),
  );
}

describe("AppFooter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTranslations();
  });

  it("renders one native legal footer with only the canonical ordered destinations", async () => {
    await renderFooter("en");

    const footer = screen.getByRole("contentinfo");
    const navigation = within(footer).getByRole("navigation", {
      name: "Legal information",
    });
    const links = within(navigation).getAllByRole("link");
    const supportLink = within(footer).getByRole("link", {
      name: "support@example.test",
    });

    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(within(footer).getAllByRole("navigation")).toHaveLength(1);
    expect(within(navigation).getByRole("list")).toBeInTheDocument();
    expect(within(navigation).getAllByRole("listitem")).toHaveLength(2);
    expect(links).toHaveLength(2);
    expect(supportLink).toHaveAttribute("href", "mailto:support@example.test");
    expect(within(navigation).queryByRole("link", { name: "support@example.test" })).not.toBeInTheDocument();
    expect(links[0]).toHaveAccessibleName("Terms of Use");
    expect(links[0]).toHaveAttribute("href", POLICY_PATHS.terms);
    expect(links[1]).toHaveAccessibleName("Privacy Notice");
    expect(links[1]).toHaveAttribute("href", POLICY_PATHS.privacy);
    expect(within(footer).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the exact footer catalog contract in parity", () => {
    expect(catalogs.en.Footer).toEqual({ navigationLabel: "Legal information" });
    expect(catalogs.es.Footer).toEqual({ navigationLabel: "Información legal" });
    expect(catalogs.ca.Footer).toEqual({ navigationLabel: "Informació legal" });

    const expectedKeys = leafKeys(catalogs.en.Footer).sort();
    expect(leafKeys(catalogs.es.Footer).sort()).toEqual(expectedKeys);
    expect(leafKeys(catalogs.ca.Footer).sort()).toEqual(expectedKeys);
  });

  it.each(["en", "es", "ca"] as const)(
    "reuses localized policy titles and canonical path inputs for %s",
    async (locale) => {
      await renderFooter(locale);

      const navigation = screen.getByRole("navigation", {
        name: catalogs[locale].Footer.navigationLabel,
      });
      const links = within(navigation).getAllByRole("link");
      const supportLink = screen.getByRole("link", {
        name: "support@example.test",
      });

      expect(supportLink).toHaveAttribute("href", "mailto:support@example.test");
      expect(links[0]).toHaveAccessibleName(catalogs[locale].Policies.terms.title);
      expect(links[0]).toHaveAttribute("href", POLICY_PATHS.terms);
      expect(links[1]).toHaveAccessibleName(
        catalogs[locale].Policies.privacy.title,
      );
      expect(links[1]).toHaveAttribute("href", POLICY_PATHS.privacy);
    },
  );

  it.each(["es", "ca"] as const)(
    "does not render English fallback copy for %s",
    async (locale) => {
      await renderFooter(locale);

      expect(document.body).not.toHaveTextContent(
        catalogs.en.Footer.navigationLabel,
      );
      expect(document.body).not.toHaveTextContent(
        catalogs.en.Policies.terms.title,
      );
      expect(document.body).not.toHaveTextContent(
        catalogs.en.Policies.privacy.title,
      );
    },
  );

  it("uses only native localized landmarks, lists, and descriptive links", async () => {
    await renderFooter("ca");

    const footer = screen.getByRole("contentinfo");
    const navigation = within(footer).getByRole("navigation", {
      name: catalogs.ca.Footer.navigationLabel,
    });
    const list = within(navigation).getByRole("list");
    const items = within(list).getAllByRole("listitem");
    const links = within(list).getAllByRole("link");

    expect(footer.tagName).toBe("FOOTER");
    expect(navigation.tagName).toBe("NAV");
    expect(list.tagName).toBe("UL");
    expect(items.every((item) => item.tagName === "LI")).toBe(true);
    expect(links.every((link) => link.tagName === "A")).toBe(true);
    expect(screen.getByRole("link", { name: "support@example.test" })).toHaveAttribute(
      "href",
      "mailto:support@example.test",
    );
    expect(links[0]).toHaveAccessibleName(catalogs.ca.Policies.terms.title);
    expect(links[1]).toHaveAccessibleName(catalogs.ca.Policies.privacy.title);
    expect(footer.querySelectorAll("[role]")).toHaveLength(0);
  });
});