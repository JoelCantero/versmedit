import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(
    async ({ locale, namespace }: { locale: string; namespace: string }) =>
      (key: string, values?: Record<string, string>) =>
        `${locale}:${namespace}:${key}${values?.version ? `:${values.version}` : ""}`,
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/modules/signup/components/signup-form", () => ({
  SignupForm: ({
    locale,
    policyDestinations,
    recoveryState,
    loginPath,
  }: {
    locale: string;
    policyDestinations: { terms: string; privacy: string };
    recoveryState?: string;
    loginPath?: string;
  }) => (
    <div
      data-testid="signup-form"
      data-locale={locale}
      data-terms={policyDestinations.terms}
      data-privacy={policyDestinations.privacy}
      data-recovery={recoveryState}
      data-login={loginPath}
    />
  ),
}));

import PrivacyPage, {
  generateMetadata as generatePrivacyMetadata,
} from "@/app/[locale]/privacy/page";
import SignupPage, {
  generateMetadata as generateSignupMetadata,
} from "@/app/[locale]/signup/page";
import TermsPage, {
  generateMetadata as generateTermsMetadata,
} from "@/app/[locale]/terms/page";

describe("localized signup routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue(null);
  });

  it.each([
    ["en", "/terms", "/privacy", "/login"],
    ["es", "/terms", "/privacy", "/login"],
    ["ca", "/terms", "/privacy", "/login"],
  ] as const)(
    "passes current policy destinations to the %s signup form",
    async (locale, terms, privacy, login) => {
      render(
        await SignupPage({ params: Promise.resolve({ locale }) }),
      );
      const form = screen.getByTestId("signup-form");
      expect(form).toHaveAttribute("data-locale", locale);
      expect(form).toHaveAttribute("data-terms", terms);
      expect(form).toHaveAttribute("data-privacy", privacy);
      expect(form).toHaveAttribute("data-login", login);
    },
  );

  it.each(["invalid_link", "session_conflict", "session_failed"] as const)(
    "passes localized recovery state %s to the signup surface",
    async (state) => {
      render(
        await SignupPage({
          params: Promise.resolve({ locale: "ca" }),
          searchParams: Promise.resolve({ state }),
        }),
      );
      expect(screen.getByTestId("signup-form")).toHaveAttribute(
        "data-recovery",
        state,
      );
    },
  );

  it.each([
    [TermsPage, "terms"],
    [PrivacyPage, "privacy"],
  ] as const)("renders localized %s policy content as an identified draft", async (Page, kind) => {
    render(await Page({ params: Promise.resolve({ locale: "es" }) }));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: `es:Policies.${kind}:title`,
      }),
    ).toBeVisible();
    const notice = screen.getByRole("note");
    expect(notice).toHaveAttribute("data-slot", "alert");
    expect(notice).toHaveTextContent("es:Policies:draftNotice");
    expect(screen.getByText(/2026-08-18-draft/)).toBeVisible();
  });

  it("prevents signup and policy pages from being indexed", async () => {
    const metadata = await Promise.all([
      generateSignupMetadata({ params: Promise.resolve({ locale: "en" }) }),
      generatePrivacyMetadata({ params: Promise.resolve({ locale: "en" }) }),
      generateTermsMetadata({ params: Promise.resolve({ locale: "en" }) }),
    ]);

    for (const pageMetadata of metadata) {
      expect(pageMetadata.robots).toEqual({ index: false, follow: false });
    }
  });

  it.each([
    ["en", "/"],
    ["es", "/es"],
    ["ca", "/ca"],
  ] as const)("redirects an authenticated %s visitor before rendering signup", async (locale, home) => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "active-user" } });

    await expect(
      SignupPage({ params: Promise.resolve({ locale }) }),
    ).rejects.toThrow(`REDIRECT:${home}`);
    expect(screen.queryByTestId("signup-form")).not.toBeInTheDocument();
  });
});