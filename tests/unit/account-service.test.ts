// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

import {
  getCurrentUserProfile,
  updateCurrentUserName,
} from "@/modules/account/service";

describe("account service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the profile by explicit server-derived user id", async () => {
    mocks.findUnique.mockResolvedValue({
      name: "Maria",
      email: "maria@example.test",
      image: "https://cdn.example.test/avatar.png",
    });

    await expect(getCurrentUserProfile("user-1")).resolves.toEqual({
      name: "Maria",
      email: "maria@example.test",
      image: "https://cdn.example.test/avatar.png",
    });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        name: true,
        email: true,
        image: true,
      },
    });
  });

  it("writes only the name field", async () => {
    mocks.update.mockResolvedValue({
      name: "Updated",
      email: "maria@example.test",
      image: null,
    });

    await expect(updateCurrentUserName("user-1", "Updated")).resolves.toEqual({
      name: "Updated",
      email: "maria@example.test",
      image: null,
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Updated" },
      select: {
        name: true,
        email: true,
        image: true,
      },
    });
  });
});