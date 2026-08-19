// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getSignupActivationAuthorization,
  runWithSignupActivation,
} from "@/modules/signup/verification-context";

describe("signup activation context", () => {
  it("exposes authorization only inside its request scope", async () => {
    expect(getSignupActivationAuthorization()).toBeNull();

    await runWithSignupActivation(
      { identifier: "first@example.test", token: "first-hash" },
      async () => {
        expect(getSignupActivationAuthorization()).toEqual({
          identifier: "first@example.test",
          token: "first-hash",
        });
      },
    );

    expect(getSignupActivationAuthorization()).toBeNull();
  });

  it("does not leak authorization across concurrent activation requests", async () => {
    const values = await Promise.all(
      ["first", "second"].map((value) =>
        runWithSignupActivation(
          { identifier: `${value}@example.test`, token: `${value}-hash` },
          async () => {
            await Promise.resolve();
            return getSignupActivationAuthorization();
          },
        ),
      ),
    );

    expect(values).toEqual([
      { identifier: "first@example.test", token: "first-hash" },
      { identifier: "second@example.test", token: "second-hash" },
    ]);
  });
});