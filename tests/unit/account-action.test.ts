// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  updateCurrentUserName: vi.fn(),
  loggerError: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));
vi.mock("@/modules/account/service", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
  updateCurrentUserName: mocks.updateCurrentUserName,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
  },
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { updateProfile } from "@/modules/account/actions/update-profile";
import type { ProfileActionState } from "@/modules/account/types";

const initialState: ProfileActionState = { status: "idle", name: "" };

describe("updateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.getCurrentUserProfile.mockResolvedValue({
      name: "Current Name",
      email: "person@example.test",
      image: null,
    });
    mocks.updateCurrentUserName.mockResolvedValue({
      name: "Updated Name",
      email: "person@example.test",
      image: null,
    });
  });

  it("succeeds for an authenticated user", async () => {
    await expect(
      updateProfile("en", initialState, [["name", "Updated Name"]]),
    ).resolves.toEqual({
      status: "success",
      name: "Updated Name",
      message: "saved",
    });
  });

  it("normalizes surrounding whitespace before persistence", async () => {
    await updateProfile("en", initialState, [["name", "  Updated Name  "]]);

    expect(mocks.updateCurrentUserName).toHaveBeenCalledWith("user-1", "Updated Name");
  });

  it("handles unchanged valid names as a safe replay", async () => {
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      name: "Current Name",
      email: "person@example.test",
      image: null,
    });

    await expect(
      updateProfile("en", initialState, [["name", "Current Name"]]),
    ).resolves.toEqual({
      status: "success",
      name: "Current Name",
      message: "saved",
    });

    expect(mocks.updateCurrentUserName).not.toHaveBeenCalled();
  });

  it("rejects extra fields including forged locale", async () => {
    await expect(
      updateProfile("en", initialState, [
        ["name", "Updated Name"],
        ["locale", "es"],
      ]),
    ).resolves.toEqual({
      status: "validation_error",
      name: "Updated Name",
      field: "form",
      message: "invalid_submission",
    });

    expect(mocks.updateCurrentUserName).not.toHaveBeenCalled();
  });

  it("rejects forged identity fields", async () => {
    await expect(
      updateProfile("en", initialState, [
        ["name", "Updated Name"],
        ["userId", "forged-user"],
      ]),
    ).resolves.toEqual({
      status: "validation_error",
      name: "Updated Name",
      field: "form",
      message: "invalid_submission",
    });
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount"],
  ] as const)(
    "redirects missing session on %s mutation without writing",
    async (locale, expectedPath) => {
      mocks.getServerSession.mockResolvedValueOnce(null);

      await expect(
        updateProfile(locale, initialState, [["name", "Updated Name"]]),
      ).rejects.toThrow(`REDIRECT:${expectedPath}`);

      expect(mocks.updateCurrentUserName).not.toHaveBeenCalled();
    },
  );

  it("treats an invalid session payload as unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: {} });

    await expect(
      updateProfile("en", initialState, [["name", "Updated Name"]]),
    ).rejects.toThrow("REDIRECT:/login?callbackUrl=%2Faccount");
    expect(mocks.updateCurrentUserName).not.toHaveBeenCalled();
  });

  it.each([
    [["name", "   "], "required"],
    [["name", "A".repeat(81)], "too_long"],
    [["name", "Jane3"], "invalid_characters"],
  ] as const)(
    "returns validation_error state for invalid name payloads",
    async (entry, expectedMessage) => {
      await expect(updateProfile("en", initialState, [entry])).resolves.toEqual({
        status: "validation_error",
        name: entry[1],
        field: "name",
        message: expectedMessage,
      });

      expect(mocks.updateCurrentUserName).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate field entries and retains attempted value", async () => {
    await expect(
      updateProfile("en", initialState, [
        ["name", "Updated Name"],
        ["name", "Another Name"],
      ]),
    ).resolves.toEqual({
      status: "validation_error",
      name: "Updated Name",
      field: "form",
      message: "invalid_submission",
    });
  });

  it("maps persistence failures to generic recoverable state and logs sanitized category", async () => {
    mocks.updateCurrentUserName.mockRejectedValueOnce(new Error("db failure"));

    await expect(
      updateProfile("en", initialState, [["name", "Updated Name"]]),
    ).resolves.toEqual({
      status: "persistence_error",
      name: "Updated Name",
      message: "save_failed",
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      { category: "account_profile_update_failed" },
      "account profile update failed",
    );
  });

  it("never logs profile values, account identifiers, or session material on failure", async () => {
    const sensitive = {
      attemptedName: "Private Profile Name",
      currentName: "Current Sensitive Name",
      email: "private-member@example.test",
      image: "https://cdn.example.test/private-member.png",
      userId: "user-sensitive-42",
      sessionToken: "next-auth.session-token=session-secret",
    };

    mocks.getServerSession.mockResolvedValueOnce({
      user: {
        id: sensitive.userId,
        email: sensitive.email,
      },
    });
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      name: sensitive.currentName,
      email: sensitive.email,
      image: sensitive.image,
    });
    mocks.updateCurrentUserName.mockRejectedValueOnce(new Error("db failure"));

    await updateProfile("en", initialState, [["name", sensitive.attemptedName]]);

    const serializedLogs = JSON.stringify(mocks.loggerError.mock.calls);
    for (const value of [
      sensitive.attemptedName,
      sensitive.currentName,
      sensitive.email,
      sensitive.image,
      sensitive.userId,
      sensitive.sessionToken,
    ]) {
      expect(serializedLogs).not.toContain(value);
    }
  });

  it("allows retry after persistence failure without page reload", async () => {
    mocks.updateCurrentUserName
      .mockRejectedValueOnce(new Error("db failure"))
      .mockResolvedValueOnce({
        name: "Updated Name",
        email: "person@example.test",
        image: null,
      });

    await expect(
      updateProfile("en", initialState, [["name", "Updated Name"]]),
    ).resolves.toEqual({
      status: "persistence_error",
      name: "Updated Name",
      message: "save_failed",
    });

    await expect(
      updateProfile("en", initialState, [["name", "Updated Name"]]),
    ).resolves.toEqual({
      status: "success",
      name: "Updated Name",
      message: "saved",
    });
  });
});