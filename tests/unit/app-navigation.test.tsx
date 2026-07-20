import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), setTheme: vi.fn(), pathname: "/projects" }));

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
  usePathname: () => mocks.pathname,
}));

import { AppNavigation } from "@/components/app-navigation";

const labels = {
  ariaLabel: "Account navigation",
  account: "Account",
  login: "Login",
  signup: "Sign up",
  logout: "Log out",
  toggleTheme: "Toggle dark mode",
  language: "Select language",
};

describe("AppNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/projects";
  });

  it("shows login and a disabled signup item to anonymous visitors", () => {
    render(<AppNavigation authenticated={false} locale="en" labels={labels} />);

    expect(screen.getByRole("navigation", { name: labels.ariaLabel })).toBeVisible();
    expect(screen.getByRole("link", { name: labels.login })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("button", { name: labels.signup })).toBeDisabled();
    expect(screen.queryByRole("button", { name: labels.logout })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="separator"]')).toBeInTheDocument();
  });

  it("shows account and logout inside one avatar menu and preserves locale", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    mocks.pathname = "/es/account";
    render(
      <AppNavigation
        authenticated
        user={{ image: "https://example.com/avatar.jpg", initials: "JC" }}
        locale="es"
        labels={labels}
      />,
    );

    expect(screen.queryByRole("link", { name: labels.login })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.signup })).not.toBeInTheDocument();
    const avatarTrigger = screen.getByRole("button", { name: labels.account });
    expect(avatarTrigger.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/avatar.jpg",
    );
    fireEvent.error(avatarTrigger.querySelector("img")!);
    expect(avatarTrigger).toHaveTextContent("JC");
    expect(avatarTrigger.querySelector("img")).not.toBeInTheDocument();

    await userEvent.click(avatarTrigger);
    const accountLink = screen.getByRole("link", { name: labels.account });
    expect(accountLink).toHaveAttribute("href", "/account");
    expect(accountLink).toHaveAttribute("aria-current", "page");
    expect(accountLink).toHaveClass("w-full", "justify-start");

    const logoutButton = screen.getByRole("button", { name: labels.logout });
    expect(logoutButton).toHaveClass("w-full", "justify-start");
    await userEvent.click(logoutButton);
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/es" });
  });

  it("switches from the resolved light theme to dark mode", async () => {
    render(<AppNavigation authenticated={false} locale="en" labels={labels} />);

    await userEvent.click(screen.getByRole("button", { name: labels.toggleTheme }));

    expect(mocks.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches locale while preserving the active pathname", async () => {
    render(<AppNavigation authenticated={false} locale="es" labels={labels} />);

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