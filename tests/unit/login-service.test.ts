// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { user: { findFirst: mocks.findFirst, create: mocks.create } },
}));

import {
  acceptedLoginResponse,
  findExistingLoginEmail,
  getLoginCallbackPath,
} from "@/modules/login/service";

describe("login service", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.create.mockReset();
  });

  it("finds a mixed-case stored email using an insensitive comparison", async () => {
    mocks.findFirst.mockResolvedValue({ email: "Person@Example.com" });

    await expect(findExistingLoginEmail("person@example.com")).resolves.toBe(
      "Person@Example.com",
    );
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        normalizedEmail: "person@example.com",
        status: "ACTIVE",
      },
      select: { email: true },
    });
  });

  it("keeps a pending normalized address ineligible for ordinary login", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      findExistingLoginEmail("pending@example.com"),
    ).resolves.toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        normalizedEmail: "pending@example.com",
        status: "ACTIVE",
      },
      select: { email: true },
    });
  });

  it("returns null without exposing lookup details for an unknown email", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(findExistingLoginEmail("unknown@example.com")).resolves.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "/"],
    ["es", "/es"],
    ["ca", "/ca"],
  ] as const)("builds the canonical %s callback path", (locale, path) => {
    expect(getLoginCallbackPath(locale)).toBe(path);
  });

  it("returns the canonical response only after the controlled floor", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn()
      .mockReturnValueOnce(1_125)
      .mockReturnValueOnce(1_549)
      .mockReturnValue(1_550);
    const response = await acceptedLoginResponse({
      startedAt: 1_000,
      now,
      random: () => 0.5,
      sleep,
    });

    expect(sleep.mock.calls).toEqual([[425], [1]]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
  });
});