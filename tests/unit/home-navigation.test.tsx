import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), setTheme: vi.fn() }));

vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: mocks.setTheme }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    locale,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    locale?: string;
  }) => (
    <a href={href} data-locale={locale} {...props}>
      {children}
    </a>
  ),
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "en" ? href : `/${locale}${href}`,
  usePathname: () => "/projects",
}));

import { HomeNavigation } from "@/components/home-navigation";

const labels = {
  ariaLabel: "Account navigation",
  login: "Login",
  signup: "Sign up",
  logout: "Log out",
  toggleTheme: "Toggle dark mode",
  language: "Select language",
};

describe("HomeNavigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows login and a disabled signup item to anonymous visitors", () => {
    render(<HomeNavigation authenticated={false} locale="en" labels={labels} />);

    expect(screen.getByRole("navigation", { name: labels.ariaLabel })).toBeVisible();
    expect(screen.getByRole("link", { name: labels.login })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("button", { name: labels.signup })).toBeDisabled();
    expect(screen.queryByRole("button", { name: labels.logout })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="separator"]')).toBeInTheDocument();
  });

  it("shows only logout to authenticated visitors and preserves locale", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    render(<HomeNavigation authenticated locale="es" labels={labels} />);

    expect(screen.queryByRole("link", { name: labels.login })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.signup })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: labels.logout }));
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/es" });
  });

  it("switches from the resolved light theme to dark mode", async () => {
    render(<HomeNavigation authenticated={false} locale="en" labels={labels} />);

    await userEvent.click(screen.getByRole("button", { name: labels.toggleTheme }));

    expect(mocks.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches locale while preserving the active pathname", async () => {
    render(<HomeNavigation authenticated={false} locale="es" labels={labels} />);

    await userEvent.click(screen.getByRole("button", { name: labels.language }));

    expect(screen.getByRole("link", { name: "CA" })).toHaveAttribute(
      "href",
      "/ca/projects",
    );
    expect(screen.getByRole("link", { name: "ENG" })).toHaveAttribute(
      "href",
      "/en/projects",
    );
    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});