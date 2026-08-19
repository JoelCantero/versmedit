// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  consumeSharedRateLimit: vi.fn(),
  validateAuthCsrfToken: vi.fn(),
  getProviderAvailability: vi.fn(),
  processSignup: vi.fn(),
  acceptedSignupResponse: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/shared-rate-limit", () => ({
  consumeSharedRateLimit: mocks.consumeSharedRateLimit,
}));
vi.mock("@/lib/auth-csrf", () => ({
  validateAuthCsrfToken: mocks.validateAuthCsrfToken,
}));
vi.mock("@/lib/provider-availability", () => ({
  getProviderAvailability: mocks.getProviderAvailability,
}));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ warn: mocks.logWarn }),
}));
vi.mock("@/modules/signup/service", () => ({
  processSignup: mocks.processSignup,
  acceptedSignupResponse: mocks.acceptedSignupResponse,
}));

import { POST } from "@/app/api/signup/route";

const validBody = {
  name: "Taylor Example",
  email: "Taylor@Example.test",
  policyAccepted: true,
  locale: "en",
  csrfToken: "csrf-token",
};

function request(
  body: unknown = validBody,
  clientIdentifier = "203.0.113.50",
) {
  return new NextRequest("https://app.example.test/api/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": clientIdentifier,
      cookie: "next-auth.csrf-token=fixture",
    },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest("https://app.example.test/api/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.50",
      cookie: "next-auth.csrf-token=fixture",
    },
    body,
  });
}

describe("POST /api/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    mocks.consumeSharedRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 900,
    });
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.getProviderAvailability.mockResolvedValue({
      available: true,
      retryAfterSeconds: 0,
    });
    mocks.processSignup.mockResolvedValue({ outcome: "onboarding_sent" });
    mocks.acceptedSignupResponse.mockResolvedValue(
      Response.json({ status: "accepted" }),
    );
  });

  it.each([
    "onboarding_sent",
    "active_notice_sent",
    "onboarding_delivery_failed",
    "active_notice_failed",
    "processing_failed",
  ])("returns the exact accepted contract for private outcome %s", async (outcome) => {
    mocks.processSignup.mockResolvedValueOnce({ outcome });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
  });

  it("orders client limit, CSRF, exact validation, address limit, provider, and service", async () => {
    await POST(request());

    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.consumeSharedRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        key: "auth:email:client:203.0.113.50",
        limit: 5,
      }),
    );
    expect(mocks.consumeSharedRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        key: expect.stringMatching(/^auth:email:address:/),
        limit: 3,
      }),
    );
    expect(mocks.consumeSharedRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.validateAuthCsrfToken.mock.invocationCallOrder[0]!,
    );
    expect(mocks.validateAuthCsrfToken.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.consumeSharedRateLimit.mock.invocationCallOrder[1]!,
    );
    expect(mocks.consumeSharedRateLimit.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.getProviderAvailability.mock.invocationCallOrder[0]!,
    );
    expect(mocks.getProviderAvailability.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.processSignup.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    { termsVersion: "client-version" },
    { unexpected: "field" },
  ])("rejects additional fields before the address allowance", async (additionalField) => {
    const response = await POST(
      request({ ...validBody, ...additionalField }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledOnce();
    expect(mocks.processSignup).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON after charging only the client allowance", async () => {
    const response = await POST(rawRequest('{"name":'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledOnce();
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.processSignup).not.toHaveBeenCalled();
  });

  it("rejects invalid CSRF after charging only the client allowance", async () => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledOnce();
    expect(mocks.processSignup).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validBody, name: "" }, "name"],
    [{ ...validBody, email: "not-an-email" }, "email"],
    [{ ...validBody, policyAccepted: false }, "policyAccepted"],
  ] as const)("rejects invalid %s input before the address allowance", async (body, field) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid", field });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledOnce();
    expect(mocks.processSignup).not.toHaveBeenCalled();
  });

  it("enforces the exact client boundary with retry headers", async () => {
    const counts = new Map<string, number>();
    mocks.consumeSharedRateLimit.mockImplementation(
      ({ key, limit }: { key: string; limit: number }) => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return Promise.resolve({
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          retryAfterSeconds: 321,
        });
      },
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(request({
        ...validBody,
        email: `client-${attempt}@example.test`,
      }));
      expect(response.status).toBe(200);
    }

    const blocked = await POST(request({
      ...validBody,
      email: "client-blocked@example.test",
    }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("321");
    expect(blocked.headers.get("x-ratelimit-remaining")).toBe("0");
    await expect(blocked.json()).resolves.toEqual({
      status: "rate_limited",
      retryAfter: 321,
    });
    expect(mocks.processSignup).toHaveBeenCalledTimes(5);
  });

  it("enforces the exact normalized-address boundary across clients", async () => {
    const counts = new Map<string, number>();
    mocks.consumeSharedRateLimit.mockImplementation(
      ({ key, limit }: { key: string; limit: number }) => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return Promise.resolve({
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          retryAfterSeconds: 654,
        });
      },
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await POST(
        request(validBody, `203.0.113.${60 + attempt}`),
      );
      expect(response.status).toBe(200);
    }

    const blocked = await POST(request(validBody, "203.0.113.70"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("654");
    expect(blocked.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(mocks.processSignup).toHaveBeenCalledTimes(3);
  });

  it("checks account-independent provider health before account work", async () => {
    mocks.getProviderAvailability.mockResolvedValue({
      available: false,
      retryAfterSeconds: 37,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("37");
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(mocks.processSignup).not.toHaveBeenCalled();
  });

  it("returns identical shared-outage responses for all private account states", async () => {
    mocks.getProviderAvailability.mockResolvedValue({
      available: false,
      retryAfterSeconds: 37,
    });

    const responses = await Promise.all(
      ["new", "pending", "active"].map(async (accountState, index) => {
        const response = await POST(request({
          ...validBody,
          name: `${accountState} person`,
          email: `${accountState}-${index}@example.test`,
        }));
        return {
          status: response.status,
          retryAfter: response.headers.get("retry-after"),
          body: await response.json(),
        };
      }),
    );

    expect(responses).toEqual([
      { status: 503, retryAfter: "37", body: { status: "unavailable" } },
      { status: 503, retryAfter: "37", body: { status: "unavailable" } },
      { status: 503, retryAfter: "37", body: { status: "unavailable" } },
    ]);
    expect(mocks.processSignup).not.toHaveBeenCalled();
  });

  it("keeps unexpected isolated processing failures private", async () => {
    mocks.processSignup.mockRejectedValue(new Error("isolated persistence failure"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
  });

  it.each(["onboarding_delivery_failed", "active_notice_failed"])(
    "uses the request-start response floor after isolated %s",
    async (outcome) => {
      const now = vi.spyOn(Date, "now").mockReturnValue(23_456);
      mocks.processSignup.mockResolvedValueOnce({ outcome });

      await POST(request());

      expect(mocks.acceptedSignupResponse).toHaveBeenCalledWith({
        startedAt: 23_456,
      });
      now.mockRestore();
    },
  );

  it("passes the request-start timestamp to the response floor", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(12_345);
    await POST(request());
    expect(mocks.acceptedSignupResponse).toHaveBeenCalledWith({
      startedAt: 12_345,
    });
    now.mockRestore();
  });
});