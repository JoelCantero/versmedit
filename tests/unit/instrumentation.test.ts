// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const getEnvMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ getEnv: getEnvMock }));

import { register } from "@/instrumentation";

describe("Next.js startup registration", () => {
  beforeEach(() => {
    getEnvMock.mockReset();
  });

  it("validates the environment synchronously before readiness", () => {
    getEnvMock.mockReturnValue({ MAIL: { enabled: false } });

    expect(register()).toBeUndefined();
    expect(getEnvMock).toHaveBeenCalledOnce();
    expect(getEnvMock).toHaveBeenCalledWith();
  });

  it("propagates malformed enabled-brand failure without exposing a value", () => {
    const suppliedValue = "private-invalid-brand-value";
    getEnvMock.mockImplementation(() => {
      throw new Error(
        "Invalid environment configuration:\nMAIL_BRAND_COLOR: must be #RRGGBB",
      );
    });

    expect(() => register()).toThrow(/MAIL_BRAND_COLOR/);
    try {
      register();
    } catch (error) {
      expect(String(error)).not.toContain(suppliedValue);
    }
    expect(getEnvMock).toHaveBeenCalledTimes(2);
  });
});
