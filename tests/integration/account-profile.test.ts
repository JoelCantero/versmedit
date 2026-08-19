// @vitest-environment node

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

function activeUser(email: string) {
  return {
    email,
    normalizedEmail: email.trim().toLowerCase(),
    status: "ACTIVE" as const,
  };
}

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
      data: { ...activeUser(`owner-${suffix}@example.test`), name: "Owner Name" },
    });
    const other = await db.user.create({
      data: { ...activeUser(`other-${suffix}@example.test`), name: "Other Name" },
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

  it("persists the last accepted name when valid updates overlap", async () => {
    const { db } = await import("@/lib/db");
    const { updateCurrentUserName } = await import("@/modules/account/service");

    const suffix = crypto.randomUUID();
    const owner = await db.user.create({
      data: {
        ...activeUser(`owner-concurrency-${suffix}@example.test`),
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
});