// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => vi.fn((key: string) => key)),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/modules/account/service", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
}));

import AccountPage from "@/app/[locale]/account/page";

describe("account route authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue(null);
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount"],
  ] as const)("redirects signed-out %s requests to localized login", async (locale, expectedPath) => {
    await expect(
      AccountPage({ params: Promise.resolve({ locale }) }),
    ).rejects.toThrow(`REDIRECT:${expectedPath}`);

    expect(mocks.getCurrentUserProfile).not.toHaveBeenCalled();
  });
});