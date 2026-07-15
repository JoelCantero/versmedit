// @vitest-environment node

import type { Adapter } from "next-auth/adapters";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hardenAdapter } from "@/lib/auth-adapter";

describe("hardenAdapter", () => {
  it("treats a missing stale session as already deleted", async () => {
    const deleteSession = vi.fn().mockRejectedValue({ code: "P2025" });
    const adapter = hardenAdapter({ deleteSession } as Adapter);

    await expect(adapter.deleteSession!("stale-token")).resolves.toBeNull();
  });

  it("rethrows unexpected database errors", async () => {
    const error = new Error("database unavailable");
    const adapter = hardenAdapter({
      deleteSession: vi.fn().mockRejectedValue(error),
    } as Adapter);

    await expect(adapter.deleteSession!("token")).rejects.toBe(error);
  });

  it("prevents authentication from creating unknown users", async () => {
    const createUser = vi.fn();
    const adapter = hardenAdapter({ createUser } as Adapter);

    await expect(
      adapter.createUser!({
        id: "new-user",
        email: "unknown@example.test",
        emailVerified: null,
      }),
    ).rejects.toThrow(/cannot create users/);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("adds safe methods when an adapter omits deleteSession", async () => {
    const adapter = {} as Adapter;
    const hardened = hardenAdapter(adapter);

    await expect(hardened.deleteSession!("missing")).resolves.toBeNull();
  });
});