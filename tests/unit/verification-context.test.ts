// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPublishedVerificationToken,
  publishVerificationToken,
  runWithVerificationContext,
} from "@/modules/login/verification-context";

describe("verification context", () => {
  it("publishes the exact token only within its request context", async () => {
    await expect(getPublishedVerificationToken()).resolves.toBeNull();

    await runWithVerificationContext(async () => {
      publishVerificationToken({ identifier: "member@example.test", token: "hash" });
      await expect(getPublishedVerificationToken()).resolves.toEqual({
        identifier: "member@example.test",
        token: "hash",
      });
    });

    await expect(getPublishedVerificationToken()).resolves.toBeNull();
  });
});