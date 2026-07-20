// @vitest-environment node

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
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
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe.skipIf(!runIntegrationTests)("account profile integration", () => {
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await db.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it("reads and updates only the session-associated user profile", async () => {
    const { db } = await import("@/lib/db");
    const { getCurrentUserProfile } = await import("@/modules/account/service");
    const { updateProfile } = await import("@/modules/account/actions/update-profile");

    const suffix = crypto.randomUUID();
    const owner = await db.user.create({
      data: { email: `owner-${suffix}@example.test`, name: "Owner Name" },
    });
    const other = await db.user.create({
      data: { email: `other-${suffix}@example.test`, name: "Other Name" },
    });
    createdUserIds.push(owner.id, other.id);
    mocks.getServerSession.mockResolvedValue({ user: { id: owner.id } });

    await expect(getCurrentUserProfile(owner.id)).resolves.toEqual({
      name: "Owner Name",
      email: `owner-${suffix}@example.test`,
      image: null,
    });

    await expect(
      updateProfile("en", { status: "idle", name: "Owner Name" }, [["name", "  Updated Owner  "]]),
    ).resolves.toEqual({
      status: "success",
      name: "Updated Owner",
      message: "saved",
    });

    const refreshedOwner = await db.user.findUnique({ where: { id: owner.id } });
    const refreshedOther = await db.user.findUnique({ where: { id: other.id } });
    expect(refreshedOwner?.name).toBe("Updated Owner");
    expect(refreshedOther?.name).toBe("Other Name");
  });

  it("rejects forged payload fields and preserves record counts", async () => {
    const { db } = await import("@/lib/db");
    const { updateProfile } = await import("@/modules/account/actions/update-profile");

    const suffix = crypto.randomUUID();
    const owner = await db.user.create({
      data: {
        email: `owner-forged-${suffix}@example.test`,
        name: "Owner Name",
        image: "https://cdn.example.test/owner.png",
      },
    });
    createdUserIds.push(owner.id);
    mocks.getServerSession.mockResolvedValue({ user: { id: owner.id } });

    const beforeCounts = {
      users: await db.user.count(),
      sessions: await db.session.count(),
    };

    await expect(
      updateProfile("en", { status: "idle", name: "Owner Name" }, [
        ["name", "Updated Owner"],
        ["email", "attacker@example.test"],
      ]),
    ).resolves.toEqual({
      status: "validation_error",
      name: "Updated Owner",
      field: "form",
      message: "invalid_submission",
    });

    const afterOwner = await db.user.findUnique({ where: { id: owner.id } });
    expect(afterOwner?.name).toBe("Owner Name");
    expect(afterOwner?.email).toBe(`owner-forged-${suffix}@example.test`);
    expect(afterOwner?.image).toBe("https://cdn.example.test/owner.png");

    const afterCounts = {
      users: await db.user.count(),
      sessions: await db.session.count(),
    };
    expect(afterCounts).toEqual(beforeCounts);
  });

  it("handles unchanged replay safely and keeps one user record", async () => {
    const { db } = await import("@/lib/db");
    const { updateProfile } = await import("@/modules/account/actions/update-profile");

    const suffix = crypto.randomUUID();
    const owner = await db.user.create({
      data: {
        email: `owner-replay-${suffix}@example.test`,
        name: "Replay Name",
      },
    });
    createdUserIds.push(owner.id);
    mocks.getServerSession.mockResolvedValue({ user: { id: owner.id } });
    const beforeUsers = await db.user.count();

    await expect(
      updateProfile("en", { status: "idle", name: "Replay Name" }, [["name", "Replay Name"]]),
    ).resolves.toEqual({
      status: "success",
      name: "Replay Name",
      message: "saved",
    });
    await expect(
      updateProfile("en", { status: "idle", name: "Replay Name" }, [["name", "Replay Name"]]),
    ).resolves.toEqual({
      status: "success",
      name: "Replay Name",
      message: "saved",
    });

    const afterUsers = await db.user.count();
    expect(afterUsers).toBe(beforeUsers);
  });

  it("persists the last accepted name when valid updates overlap", async () => {
    const { db } = await import("@/lib/db");
    const { updateCurrentUserName } = await import("@/modules/account/service");

    const suffix = crypto.randomUUID();
    const owner = await db.user.create({
      data: {
        email: `owner-concurrency-${suffix}@example.test`,
        name: "Original",
      },
    });
    createdUserIds.push(owner.id);

    await Promise.all([
      updateCurrentUserName(owner.id, "First Name"),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return updateCurrentUserName(owner.id, "Second Name");
      })(),
    ]);

    const refreshed = await db.user.findUnique({ where: { id: owner.id } });
    expect(refreshed?.name).toBe("Second Name");
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount"],
  ] as const)(
    "redirects unauthenticated mutation attempts for %s without writing",
    async (locale, expectedPath) => {
      const { db } = await import("@/lib/db");
      const { updateProfile } = await import("@/modules/account/actions/update-profile");
      const suffix = crypto.randomUUID();
      const owner = await db.user.create({
        data: {
          email: `owner-redirect-${suffix}@example.test`,
          name: "Owner Name",
        },
      });
      createdUserIds.push(owner.id);
      mocks.getServerSession.mockResolvedValueOnce(null);

      await expect(
        updateProfile(locale, { status: "idle", name: "Owner Name" }, [["name", "Updated Owner"]]),
      ).rejects.toThrow(`REDIRECT:${expectedPath}`);

      const unchanged = await db.user.findUnique({ where: { id: owner.id } });
      expect(unchanged?.name).toBe("Owner Name");
    },
  );

  it.each(["", " ", "A".repeat(81), "Name3"])(
    "does not write invalid submissions and returns non-enumerating validation state",
    async (invalidName) => {
      const { db } = await import("@/lib/db");
      const { updateProfile } = await import("@/modules/account/actions/update-profile");

      const suffix = crypto.randomUUID();
      const owner = await db.user.create({
        data: {
          email: `owner-invalid-${suffix}@example.test`,
          name: "Owner Name",
          image: "https://cdn.example.test/owner.png",
        },
      });
      createdUserIds.push(owner.id);
      mocks.getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });

      const before = await db.user.findUnique({ where: { id: owner.id } });
      const result = await updateProfile(
        "en",
        { status: "idle", name: "Owner Name" },
        [["name", invalidName]],
      );

      expect(result.status).toBe("validation_error");
      const after = await db.user.findUnique({ where: { id: owner.id } });
      expect(after).toMatchObject({
        name: before?.name,
        email: before?.email,
        image: before?.image,
      });
    },
  );

  it("keeps profile unchanged when persistence fails", async () => {
    const { db } = await import("@/lib/db");
    const { updateProfile } = await import("@/modules/account/actions/update-profile");

    const suffix = crypto.randomUUID();
    const owner = await db.user.create({
      data: {
        email: `owner-persistence-${suffix}@example.test`,
        name: "Owner Name",
        image: "https://cdn.example.test/owner.png",
      },
    });
    createdUserIds.push(owner.id);
    mocks.getServerSession.mockResolvedValue({ user: { id: owner.id } });

    const originalName = owner.name;
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: owner.id }, data: { name: "Owner Name" } });
    });

    const service = await import("@/modules/account/service");
    const spy = vi
      .spyOn(service, "updateCurrentUserName")
      .mockRejectedValueOnce(new Error("simulated persistence failure"));

    try {
      await expect(
        updateProfile("en", { status: "idle", name: "Owner Name" }, [["name", "Updated Name"]]),
      ).resolves.toEqual({
        status: "persistence_error",
        name: "Updated Name",
        message: "save_failed",
      });
    } finally {
      spy.mockRestore();
    }

    const after = await db.user.findUnique({ where: { id: owner.id } });
    expect(after?.name).toBe(originalName);
    expect(after?.email).toBe(`owner-persistence-${suffix}@example.test`);
    expect(after?.image).toBe("https://cdn.example.test/owner.png");
  });
});