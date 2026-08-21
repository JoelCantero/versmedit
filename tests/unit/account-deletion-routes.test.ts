// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  consumeSharedRateLimit: vi.fn(),
  validateAuthCsrfToken: vi.fn(),
  isCanonicalRequestOrigin: vi.fn(),
  getClientIdentifier: vi.fn(() => "203.0.113.70"),
  readAccountSessionToken: vi.fn(() => "session-token"),
  issueAccountDeletionReauthentication: vi.fn(),
  deleteCurrentAccount: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  env: {
    NEXTAUTH_URL: "https://app.example.test",
    AUTH_SECRET: "route-test-secret-at-least-32-characters",
    MAIL: { enabled: true as boolean },
  },
}));

vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("@/lib/auth-csrf", () => ({
  validateAuthCsrfToken: mocks.validateAuthCsrfToken,
}));
vi.mock("@/lib/request-context", () => ({
  isCanonicalRequestOrigin: mocks.isCanonicalRequestOrigin,
  getClientIdentifier: mocks.getClientIdentifier,
}));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeSharedRateLimit: mocks.consumeSharedRateLimit,
}));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}));
vi.mock("@/modules/account/deletion/session", () => ({
  readAccountSessionToken: mocks.readAccountSessionToken,
  expireAccountSessionCookies: () => [
    "next-auth.session-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    "__Secure-next-auth.session-token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  ],
}));
vi.mock("@/modules/account/deletion/service", () => ({
  issueAccountDeletionReauthentication: mocks.issueAccountDeletionReauthentication,
  deleteCurrentAccount: mocks.deleteCurrentAccount,
}));

import { POST as reauthenticate } from "@/app/api/account/deletion/reauthenticate/route";
import { POST as deleteAccount } from "@/app/api/account/deletion/route";

function request(
  path: string,
  body: Record<string, unknown> | string,
  cookie = "next-auth.session-token=session-token; next-auth.csrf-token=fixture",
) {
  return new NextRequest(`https://app.example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("account deletion routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.consumeSharedRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 900,
    });
    mocks.issueAccountDeletionReauthentication.mockResolvedValue({ status: "sent" });
    mocks.deleteCurrentAccount.mockResolvedValue({ status: "completed" });
    mocks.env.MAIL.enabled = true;
  });

  it("returns 202 after session-derived reauthentication issuance", async () => {
    const response = await reauthenticate(
      request("/api/account/deletion/reauthenticate", {
        csrfToken: "csrf",
        locale: "es",
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "sent" });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledWith({
      key: "account:deletion:reauth:client:203.0.113.70",
      limit: 5,
      windowMs: 15 * 60_000,
    });
    expect(mocks.issueAccountDeletionReauthentication).toHaveBeenCalledWith({
      sessionToken: "session-token",
      locale: "es",
      origin: "https://app.example.test",
    });
  });

  it("returns localized completion and expires both session cookie variants", async () => {
    const response = await deleteAccount(
      request("/api/account/deletion", {
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "permanently_delete",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "completed",
      redirectTo: "/ca/account-deleted",
    });
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringContaining("next-auth.session-token=;"),
      expect.stringContaining("__Secure-next-auth.session-token=;"),
    ]);
    expect(mocks.deleteCurrentAccount).toHaveBeenCalledWith({
      sessionToken: "session-token",
    });
  });

  it("maps a concurrent completion to the same public response with a distinct safe event", async () => {
    mocks.deleteCurrentAccount.mockResolvedValue({ status: "concurrent_completed" });
    const response = await deleteAccount(
      request("/api/account/deletion", {
        csrfToken: "csrf",
        locale: "es",
        confirmation: "permanently_delete",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "completed",
      redirectTo: "/es/account-deleted",
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "delete_concurrent_completed",
        durationMs: expect.any(Number),
      }),
      "account deletion completed",
    );
  });

  it("returns a generic conflict when recent authentication expires", async () => {
    mocks.deleteCurrentAccount.mockResolvedValue({
      status: "reauthentication_required",
    });
    const response = await deleteAccount(
      request("/api/account/deletion", {
        csrfToken: "csrf",
        locale: "en",
        confirmation: "permanently_delete",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      status: "reauthentication_required",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("maps rejected reauthentication delivery to a generic retryable response", async () => {
    mocks.issueAccountDeletionReauthentication.mockResolvedValue({
      status: "unavailable",
      internalReason: "provider exposed detail",
    });

    const response = await reauthenticate(
      request("/api/account/deletion/reauthenticate", {
        csrfToken: "csrf",
        locale: "en",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "reauth_failed", durationMs: expect.any(Number) }),
      "account deletion reauthentication completed",
    );
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain("provider exposed detail");
  });

  it("maps a rolled-back deletion to a generic retryable response", async () => {
    mocks.deleteCurrentAccount.mockResolvedValue({
      status: "deletion_failed",
      internalReason: "database exposed detail",
    });

    const response = await deleteAccount(
      request("/api/account/deletion", {
        csrfToken: "csrf",
        locale: "es",
        confirmation: "permanently_delete",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "deletion_failed" });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "delete_failed", durationMs: expect.any(Number) }),
      "account deletion completed",
    );
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain("database exposed detail");
  });

  it.each([
    ["reauthentication", reauthenticate, "/api/account/deletion/reauthenticate"],
    ["deletion", deleteAccount, "/api/account/deletion"],
  ] as const)("returns retry metadata before %s work when client-limited", async (_label, handler, path) => {
    mocks.consumeSharedRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 347,
    });

    const response = await handler(
      request(
        path,
        path.endsWith("reauthenticate")
          ? { csrfToken: "csrf", locale: "ca" }
          : {
              csrfToken: "csrf",
              locale: "ca",
              confirmation: "permanently_delete",
            },
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("347");
    await expect(response.json()).resolves.toEqual({
      status: "rate_limited",
      retryAfter: 347,
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        outcome: path.endsWith("reauthenticate")
          ? "reauth_failed"
          : "delete_failed",
        durationMs: expect.any(Number),
        retryAfter: 347,
      },
      path.endsWith("reauthenticate")
        ? "account deletion reauthentication completed"
        : "account deletion completed",
    );
    expect(mocks.issueAccountDeletionReauthentication).not.toHaveBeenCalled();
    expect(mocks.deleteCurrentAccount).not.toHaveBeenCalled();
  });

  it.each([
    [
      "/api/account/deletion/reauthenticate",
      reauthenticate,
      { csrfToken: "csrf", locale: "en", email: "victim@example.test" },
    ],
    [
      "/api/account/deletion/reauthenticate",
      reauthenticate,
      { csrfToken: "csrf", locale: "en", userId: "victim" },
    ],
    [
      "/api/account/deletion",
      deleteAccount,
      {
        csrfToken: "csrf",
        locale: "en",
        confirmation: "permanently_delete",
        sessionToken: "forged",
      },
    ],
  ] as const)("rejects identity-bearing or unknown fields for %s", async (path, handler, body) => {
    const response = await handler(request(path, body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(mocks.issueAccountDeletionReauthentication).not.toHaveBeenCalled();
    expect(mocks.deleteCurrentAccount).not.toHaveBeenCalled();
  });

  it.each([
    [
      "/api/account/deletion/reauthenticate",
      reauthenticate,
      '{"csrfToken":"csrf","locale":"en","locale":"ca"}',
    ],
    [
      "/api/account/deletion",
      deleteAccount,
      '{"csrfToken":"csrf","locale":"en","confirmation":"permanently_delete","confirmation":"permanently_delete"}',
    ],
  ] as const)("rejects duplicate JSON fields for %s", async (path, handler, body) => {
    const response = await handler(request(path, body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
  });

  it.each([
    ["reauthentication", reauthenticate, "/api/account/deletion/reauthenticate"],
    ["deletion", deleteAccount, "/api/account/deletion"],
  ] as const)("rejects a mismatched canonical origin before %s work", async (_label, handler, path) => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);
    const response = await handler(
      request(
        path,
        path.endsWith("reauthenticate")
          ? { csrfToken: "csrf", locale: "en" }
          : {
              csrfToken: "csrf",
              locale: "en",
              confirmation: "permanently_delete",
            },
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.consumeSharedRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["reauthentication", reauthenticate, "/api/account/deletion/reauthenticate"],
    ["deletion", deleteAccount, "/api/account/deletion"],
  ] as const)("rejects invalid CSRF before %s service work", async (_label, handler, path) => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);
    const response = await handler(
      request(
        path,
        path.endsWith("reauthenticate")
          ? { csrfToken: "forged", locale: "es" }
          : {
              csrfToken: "forged",
              locale: "es",
              confirmation: "permanently_delete",
            },
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.issueAccountDeletionReauthentication).not.toHaveBeenCalled();
    expect(mocks.deleteCurrentAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["next-auth.session-token=plain; next-auth.csrf-token=fixture", "plain"],
    ["__Secure-next-auth.session-token=secure; next-auth.csrf-token=fixture", "secure"],
  ])("passes the exact supported session cookie to server-side resolution", async (cookie, token) => {
    mocks.readAccountSessionToken.mockReturnValueOnce(token);
    const response = await deleteAccount(
      request(
        "/api/account/deletion",
        {
          csrfToken: "csrf",
          locale: "en",
          confirmation: "permanently_delete",
        },
        cookie,
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.readAccountSessionToken).toHaveBeenCalledWith(cookie);
    expect(mocks.deleteCurrentAccount).toHaveBeenCalledWith({ sessionToken: token });
  });

  it.each(["signed-out", "revoked", "replayed"])(
    "returns the same unauthenticated deletion response for %s state",
    async () => {
      mocks.deleteCurrentAccount.mockResolvedValue({ status: "unauthenticated" });
      const response = await deleteAccount(
        request("/api/account/deletion", {
          csrfToken: "csrf",
          locale: "ca",
          confirmation: "permanently_delete",
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        status: "unauthenticated",
        redirectTo: "/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata",
      });
    },
  );

  it("returns the shared address-limit retry boundary unchanged", async () => {
    mocks.issueAccountDeletionReauthentication.mockResolvedValue({
      status: "rate_limited",
      retryAfter: 611,
    });
    const response = await reauthenticate(
      request("/api/account/deletion/reauthenticate", {
        csrfToken: "csrf",
        locale: "en",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("611");
    await expect(response.json()).resolves.toEqual({
      status: "rate_limited",
      retryAfter: 611,
    });
  });
});