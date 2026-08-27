// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  appNavigation: vi.fn(),
  projectName: "Configured Project",
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ PROJECT_NAME: mocks.projectName }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => `navigation.${key}`),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/app-navigation", () => ({
  AppNavigation: (props: unknown) => {
    mocks.appNavigation(props);
    return null;
  },
}));

import { AppHeader } from "@/components/app-header";

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes authenticated localized navigation state to the shared header", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Joel Cantero",
        email: "joel@example.com",
        image: "https://example.com/avatar.jpg",
      },
    });

    const markup = renderToStaticMarkup(await AppHeader({ locale: "es" }));

    expect(markup).toContain('<a href="/"');
    expect(markup).toContain(`>${mocks.projectName}</a>`);

    expect(mocks.appNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        user: {
          image: "https://example.com/avatar.jpg",
          initials: "JC",
        },
        locale: "es",
        labels: expect.objectContaining({
          account: "navigation.account",
          language: "navigation.language",
        }),
      }),
    );
  });
});