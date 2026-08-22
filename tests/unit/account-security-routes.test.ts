// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  consumeSharedRateLimit: vi.fn(),
  validateAuthCsrfToken: vi.fn(),
  isCanonicalRequestOrigin: vi.fn(),
  getClientIdentifier: vi.fn(() => "203.0.113.88"),
  readAccountSessionToken: vi.fn(
    (): string | null => "current-session-token",
  ),
  issueAccountSecurityReauthentication: vi.fn(),
  verifyAccountSecurityReauthentication: vi.fn(),
  revokeAccountSession: vi.fn(),
  revokeAllOtherAccountSessions: vi.fn(),
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
vi.mock("@/modules/account/session", () => ({
  readAccountSessionToken: mocks.readAccountSessionToken,
}));
vi.mock("@/modules/account/security/service", () => ({
  issueAccountSecurityReauthentication:
    mocks.issueAccountSecurityReauthentication,
  verifyAccountSecurityReauthentication:
    mocks.verifyAccountSecurityReauthentication,
  revokeAccountSession: mocks.revokeAccountSession,
  revokeAllOtherAccountSessions: mocks.revokeAllOtherAccountSessions,
}));

import { POST as POSTReauthentication } from "@/app/api/account/security/reauthenticate/route";
import { GET as GETVerification } from "@/app/api/account/security/verify/route";
import { POST } from "@/app/api/account/security/sessions/revoke/route";
import { POST as POSTBulk } from "@/app/api/account/security/sessions/revoke-others/route";

function request(
  body: Record<string, unknown> | string,
  cookie =
    "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
) {
  return new NextRequest(
    "https://app.example.test/api/account/security/sessions/revoke",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        host: "app.example.test",
        origin: "https://app.example.test",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

const validBody = {
  csrfToken: "csrf-proof",
  locale: "en",
  confirmation: "revoke_session",
  sessionId: "opaque-target",
} as const;

const validBulkBody = {
  csrfToken: "csrf-proof",
  locale: "en",
  confirmation: "revoke_other_sessions",
} as const;

const validReauthenticationBody = {
  csrfToken: "csrf-proof",
  locale: "en",
} as const;

function reauthenticationRequest(
  body: Record<string, unknown> | string,
  cookie =
    "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
) {
  return new NextRequest(
    "https://app.example.test/api/account/security/reauthenticate",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        host: "app.example.test",
        origin: "https://app.example.test",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

function verificationRequest(query: string, cookie?: string) {
  return new NextRequest(
    `https://app.example.test/api/account/security/verify?${query}`,
    {
      headers: {
        ...(cookie ? { cookie } : {}),
        host: "app.example.test",
      },
    },
  );
}

function bulkRequest(
  body: Record<string, unknown> | string,
  cookie =
    "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
) {
  return new NextRequest(
    "https://app.example.test/api/account/security/sessions/revoke-others",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        host: "app.example.test",
        origin: "https://app.example.test",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

describe("account security reauthentication issuance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.readAccountSessionToken.mockReturnValue("current-session-token");
    mocks.consumeSharedRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 900,
    });
    mocks.issueAccountSecurityReauthentication.mockResolvedValue({
      status: "sent",
    });
    mocks.env.MAIL.enabled = true;
  });

  it("returns 202 after exact trusted-client limiting and session-derived delivery", async () => {
    const response = await POSTReauthentication(
      reauthenticationRequest(validReauthenticationBody),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "sent" });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledExactlyOnceWith({
      key: "account:security:reauth:client:203.0.113.88",
      limit: 5,
      windowMs: 15 * 60_000,
    });
    expect(mocks.validateAuthCsrfToken).toHaveBeenCalledWith({
      bodyToken: "csrf-proof",
      cookieHeader:
        "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
      secret: mocks.env.AUTH_SECRET,
    });
    expect(mocks.issueAccountSecurityReauthentication).toHaveBeenCalledWith({
      sessionToken: "current-session-token",
      locale: "en",
      origin: "https://app.example.test",
    });
    expect(mocks.consumeSharedRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.issueAccountSecurityReauthentication.mock.invocationCallOrder[0]!,
    );
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { outcome: "reauthentication_sent" },
      "account security reauthentication completed",
    );
  });

  it("returns a generic 429 with Retry-After before provider delivery", async () => {
    mocks.consumeSharedRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 347,
    });

    const response = await POSTReauthentication(
      reauthenticationRequest(validReauthenticationBody),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("347");
    await expect(response.json()).resolves.toEqual({
      status: "rate_limited",
      retryAfter: 347,
    });
    expect(mocks.issueAccountSecurityReauthentication).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { outcome: "reauthentication_rate_limited" },
      "account security reauthentication completed",
    );
  });

  it.each([
    ["not-json"],
    ['{"csrfToken":"csrf-proof","locale":"en","locale":"ca"}'],
    [{ ...validReauthenticationBody, action: "revoke_session" }],
    [{ ...validReauthenticationBody, sessionId: "target" }],
    [{ ...validReauthenticationBody, selector: "target" }],
    [{ ...validReauthenticationBody, email: "person@example.test" }],
    [{ ...validReauthenticationBody, userId: "owner" }],
    [{ ...validReauthenticationBody, token: "credential" }],
    [{ ...validReauthenticationBody, sessionToken: "credential" }],
  ])("rejects a non-contract issuance payload %j", async (body) => {
    const response = await POSTReauthentication(reauthenticationRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "invalid_request",
    });
    expect(mocks.issueAccountSecurityReauthentication).not.toHaveBeenCalled();
  });

  it("rejects a noncanonical POST before limiting or parsing", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const response = await POSTReauthentication(
      reauthenticationRequest(validReauthenticationBody),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.consumeSharedRateLimit).not.toHaveBeenCalled();
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
  });

  it("rejects invalid CSRF before resolving the trusted session", async () => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);

    const response = await POSTReauthentication(
      reauthenticationRequest(validReauthenticationBody),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.readAccountSessionToken).not.toHaveBeenCalled();
    expect(mocks.issueAccountSecurityReauthentication).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount%2Fsecurity"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity"],
  ] as const)(
    "returns the fixed localized login path for a missing %s session",
    async (locale, redirectTo) => {
      mocks.readAccountSessionToken.mockReturnValue(null);

      const response = await POSTReauthentication(
        reauthenticationRequest({ ...validReauthenticationBody, locale }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        status: "unauthenticated",
        redirectTo,
      });
      expect(mocks.issueAccountSecurityReauthentication).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["rate_limited", 429],
    ["unavailable", 503],
    ["unauthenticated", 401],
  ] as const)("maps the %s service outcome generically", async (status, expected) => {
    mocks.issueAccountSecurityReauthentication.mockResolvedValue({
      status,
      retryAfter: status === "rate_limited" ? 611 : undefined,
      internalReason: "provider or database detail",
    });

    const response = await POSTReauthentication(
      reauthenticationRequest({ ...validReauthenticationBody, locale: "ca" }),
    );

    expect(response.status).toBe(expected);
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain("provider or database detail");
    if (status === "rate_limited") {
      expect(response.headers.get("retry-after")).toBe("611");
      expect(payload).toEqual({ status: "rate_limited", retryAfter: 611 });
    } else if (status === "unauthenticated") {
      expect(payload).toEqual({
        status: "unauthenticated",
        redirectTo: "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity",
      });
    } else {
      expect(payload).toEqual({ status: "unavailable" });
    }
  });

  it("returns unavailable before service work when mail is disabled", async () => {
    mocks.env.MAIL.enabled = false;

    const response = await POSTReauthentication(
      reauthenticationRequest(validReauthenticationBody),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(mocks.issueAccountSecurityReauthentication).not.toHaveBeenCalled();
  });

  it("logs fixed outcomes without retry, timing, identity, credential, or request data", async () => {
    await POSTReauthentication(
      reauthenticationRequest(validReauthenticationBody),
    );

    const serializedLogs = JSON.stringify([
      ...mocks.loggerInfo.mock.calls,
      ...mocks.loggerWarn.mock.calls,
    ]);
    expect(mocks.loggerInfo.mock.calls[0]?.[0]).toEqual({
      outcome: "reauthentication_sent",
    });
    for (const forbiddenValue of [
      "203.0.113.88",
      "current-session-token",
      "csrf-proof",
      "duration",
      "retry",
      "email",
      "sessionId",
      "request",
      "token",
    ]) {
      expect(serializedLogs.toLowerCase()).not.toContain(
        forbiddenValue.toLowerCase(),
      );
    }
  });
});

describe("account security verification callback route", () => {
  const rawToken = Buffer.alloc(32, 3).toString("base64url");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.readAccountSessionToken.mockReturnValue("current-session-token");
    mocks.verifyAccountSecurityReauthentication.mockResolvedValue({
      status: "reauthenticated",
      locale: "es",
    });
  });

  it("accepts a canonical top-level GET without Origin and sets no cookie", async () => {
    const request = verificationRequest(
      `token=${rawToken}`,
      "next-auth.session-token=current-session-token",
    );
    expect(request.headers.has("origin")).toBe(false);

    const response = await GETVerification(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/security?state=reauthenticated",
    );
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.verifyAccountSecurityReauthentication).toHaveBeenCalledWith({
      rawToken,
      sessionToken: "current-session-token",
    });
  });

  it("returns 421 for a mismatched effective scheme, host, or port", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const response = await GETVerification(
      verificationRequest(`token=${rawToken}`),
    );

    expect(response.status).toBe(421);
    await expect(response.json()).resolves.toEqual({
      status: "misdirected_request",
    });
    expect(mocks.verifyAccountSecurityReauthentication).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_link", "en", "/account/security?state=invalid_link"],
    [
      "session_conflict",
      "ca",
      "/ca/account/security?state=session_conflict",
    ],
  ] as const)(
    "redirects %s to only the fixed localized credential-free state",
    async (status, locale, expectedPath) => {
      mocks.verifyAccountSecurityReauthentication.mockResolvedValue({
        status,
        locale,
        token: rawToken,
        sessionId: "forbidden-selector",
      });

      const response = await GETVerification(
        verificationRequest(
          `token=${rawToken}`,
          "next-auth.session-token=current-session-token",
        ),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://app.example.test${expectedPath}`,
      );
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get("location")).not.toMatch(
        /token|sessionId|selector|action|confirmation|email|userId/i,
      );
    },
  );

  it.each([
    "",
    `token=${"a".repeat(42)}`,
    `token=${rawToken}&action=revoke_session`,
    `token=${rawToken}&sessionId=target`,
    `token=${rawToken}&email=person%40example.test`,
    `token=${rawToken}&token=${rawToken}`,
  ])("rejects malformed or carry-over callback query %j", async (query) => {
    const response = await GETVerification(verificationRequest(query));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account/security?state=invalid_link",
    );
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.verifyAccountSecurityReauthentication).not.toHaveBeenCalled();
  });

  it("passes a missing session to the service without consuming policy in the route", async () => {
    mocks.readAccountSessionToken.mockReturnValue(null);
    mocks.verifyAccountSecurityReauthentication.mockResolvedValue({
      status: "invalid_link",
      locale: "ca",
    });

    const response = await GETVerification(
      verificationRequest(`token=${rawToken}`),
    );

    expect(mocks.verifyAccountSecurityReauthentication).toHaveBeenCalledWith({
      rawToken,
      sessionToken: null,
    });
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/ca/account/security?state=invalid_link",
    );
  });

  it("logs only a fixed callback outcome", async () => {
    await GETVerification(
      verificationRequest(
        `token=${rawToken}`,
        "next-auth.session-token=current-session-token",
      ),
    );

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { outcome: "verification_reauthenticated" },
      "account security verification completed",
    );
    const serializedLogs = JSON.stringify([
      ...mocks.loggerInfo.mock.calls,
      ...mocks.loggerWarn.mock.calls,
    ]);
    for (const forbiddenValue of [
      rawToken,
      "current-session-token",
      "duration",
      "retry",
      "sessionId",
      "email",
      "request",
    ]) {
      expect(serializedLogs).not.toContain(forbiddenValue);
    }
  });
});

describe("individual account security revocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.readAccountSessionToken.mockReturnValue("current-session-token");
    mocks.revokeAccountSession.mockResolvedValue({ status: "completed" });
  });

  it("returns one generic completed response for an authorized deletion", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "completed" });
    expect(mocks.revokeAccountSession).toHaveBeenCalledWith({
      sessionToken: "current-session-token",
      sessionId: "opaque-target",
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { outcome: "revoke_session_completed" },
      "account security session revocation completed",
    );
  });

  it.each(["missing", "expired", "current", "foreign", "already-revoked"])(
    "does not disclose a %s selector through the completed response",
    async () => {
      mocks.revokeAccountSession.mockResolvedValue({ status: "completed" });

      const response = await POST(request(validBody));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "completed" });
    },
  );

  it.each([
    ["not-json"],
    [
      '{"csrfToken":"csrf-proof","locale":"en","confirmation":"revoke_session","sessionId":"one","sessionId":"two"}',
    ],
    [{ ...validBody, confirmation: "revoke" }],
    [{ ...validBody, email: "victim@example.test" }],
    [{ ...validBody, userId: "victim" }],
    [{ ...validBody, sessionToken: "credential" }],
    [{ ...validBody, ownership: true }],
  ])("rejects malformed or non-contract payload %j", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "invalid_request",
    });
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.revokeAccountSession).not.toHaveBeenCalled();
  });

  it("rejects a mismatched canonical effective origin before parsing", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.revokeAccountSession).not.toHaveBeenCalled();
  });

  it("rejects invalid Auth.js CSRF proof before session resolution", async () => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.validateAuthCsrfToken).toHaveBeenCalledWith({
      bodyToken: "csrf-proof",
      cookieHeader:
        "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
      secret: mocks.env.AUTH_SECRET,
    });
    expect(mocks.readAccountSessionToken).not.toHaveBeenCalled();
    expect(mocks.revokeAccountSession).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount%2Fsecurity"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity"],
  ] as const)(
    "returns the fixed localized login path for a missing %s session cookie",
    async (locale, redirectTo) => {
      mocks.readAccountSessionToken.mockReturnValue(null);

      const response = await POST(request({ ...validBody, locale }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        status: "unauthenticated",
        redirectTo,
      });
      expect(mocks.revokeAccountSession).not.toHaveBeenCalled();
    },
  );

  it("maps a current session lost during locked revalidation to authentication", async () => {
    mocks.revokeAccountSession.mockResolvedValue({ status: "unauthenticated" });

    const response = await POST(request({ ...validBody, locale: "ca" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "unauthenticated",
      redirectTo: "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity",
    });
  });

  it("maps stale exact-session evidence to a generic conflict", async () => {
    mocks.revokeAccountSession.mockResolvedValue({
      status: "reauthentication_required",
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      status: "reauthentication_required",
    });
  });

  it("maps a rolled-back transaction to a generic failure", async () => {
    mocks.revokeAccountSession.mockResolvedValue({
      status: "revocation_failed",
      internalReason: "database detail",
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      status: "revocation_failed",
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { outcome: "revoke_session_failed" },
      "account security session revocation completed",
    );
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(
      "database detail",
    );
  });

  it("logs only a fixed sanitized outcome without request or timing data", async () => {
    await POST(request(validBody));

    const serializedLogs = JSON.stringify([
      ...mocks.loggerInfo.mock.calls,
      ...mocks.loggerWarn.mock.calls,
    ]);
    expect(mocks.loggerInfo.mock.calls[0]?.[0]).toEqual({
      outcome: "revoke_session_completed",
    });
    for (const forbiddenValue of [
      "opaque-target",
      "current-session-token",
      "csrf-proof",
      "durationMs",
      "retryAfter",
      "sessionId",
      "requestBody",
    ]) {
      expect(serializedLogs).not.toContain(forbiddenValue);
    }
  });
});

describe("bulk account security revocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.readAccountSessionToken.mockReturnValue("current-session-token");
    mocks.revokeAllOtherAccountSessions.mockResolvedValue({
      status: "completed",
    });
  });

  it("accepts only the exact targetless contract and returns a generic completion", async () => {
    const response = await POSTBulk(bulkRequest(validBulkBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "completed" });
    expect(mocks.validateAuthCsrfToken).toHaveBeenCalledWith({
      bodyToken: "csrf-proof",
      cookieHeader:
        "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
      secret: mocks.env.AUTH_SECRET,
    });
    expect(mocks.revokeAllOtherAccountSessions).toHaveBeenCalledWith({
      sessionToken: "current-session-token",
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { outcome: "revoke_other_sessions_completed" },
      "account security bulk session revocation completed",
    );
  });

  it.each([
    ["not-json"],
    [
      '{"csrfToken":"csrf-proof","csrfToken":"other","locale":"en","confirmation":"revoke_other_sessions"}',
    ],
    [
      '{"csrfToken":"csrf-proof","locale":"en","locale":"ca","confirmation":"revoke_other_sessions"}',
    ],
    [
      '{"csrfToken":"csrf-proof","locale":"en","confirmation":"revoke_other_sessions","confirmation":"revoke_session"}',
    ],
    [{ locale: "en", confirmation: "revoke_other_sessions" }],
    [{ csrfToken: "csrf-proof", confirmation: "revoke_other_sessions" }],
    [{ csrfToken: "csrf-proof", locale: "fr", confirmation: "revoke_other_sessions" }],
    [{ ...validBulkBody, confirmation: "revoke_session" }],
    [{ ...validBulkBody, sessionId: "forbidden-selector" }],
    [{ ...validBulkBody, selector: "forbidden-selector" }],
    [{ ...validBulkBody, target: "forbidden-target" }],
    [{ ...validBulkBody, user: { id: "forbidden-user" } }],
    [{ ...validBulkBody, userId: "forbidden-user" }],
    [{ ...validBulkBody, email: "forbidden@example.test" }],
    [{ ...validBulkBody, normalizedEmail: "forbidden@example.test" }],
    [{ ...validBulkBody, sessionToken: "forbidden-credential" }],
    [{ ...validBulkBody, credentials: "include" }],
    [{ ...validBulkBody, current: true }],
    [{ ...validBulkBody, ownership: true }],
    [{ ...validBulkBody, authorized: true }],
    [{ ...validBulkBody, count: 2 }],
    [{ ...validBulkBody, unknown: "forbidden" }],
  ])("rejects malformed, duplicate, or forbidden bulk payload %j", async (body) => {
    const response = await POSTBulk(bulkRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "invalid_request",
    });
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.revokeAllOtherAccountSessions).not.toHaveBeenCalled();
  });

  it("rejects a mismatched canonical effective origin before parsing", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const response = await POSTBulk(bulkRequest(validBulkBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.revokeAllOtherAccountSessions).not.toHaveBeenCalled();
  });

  it("rejects invalid Auth.js CSRF proof before resolving the current session", async () => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);

    const response = await POSTBulk(bulkRequest(validBulkBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "forbidden" });
    expect(mocks.readAccountSessionToken).not.toHaveBeenCalled();
    expect(mocks.revokeAllOtherAccountSessions).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "/login?callbackUrl=%2Faccount%2Fsecurity"],
    ["es", "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity"],
    ["ca", "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity"],
  ] as const)(
    "returns the fixed localized login path for a missing %s session cookie",
    async (locale, redirectTo) => {
      mocks.readAccountSessionToken.mockReturnValue(null);

      const response = await POSTBulk(
        bulkRequest({ ...validBulkBody, locale }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        status: "unauthenticated",
        redirectTo,
      });
      expect(mocks.revokeAllOtherAccountSessions).not.toHaveBeenCalled();
    },
  );

  it("maps a current session lost during locked revalidation to authentication", async () => {
    mocks.revokeAllOtherAccountSessions.mockResolvedValue({
      status: "unauthenticated",
    });

    const response = await POSTBulk(
      bulkRequest({ ...validBulkBody, locale: "es" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "unauthenticated",
      redirectTo: "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity",
    });
  });

  it("maps stale exact-session evidence to the generic conflict", async () => {
    mocks.revokeAllOtherAccountSessions.mockResolvedValue({
      status: "reauthentication_required",
    });

    const response = await POSTBulk(bulkRequest(validBulkBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      status: "reauthentication_required",
    });
  });

  it("maps a rolled-back transaction to a generic failure", async () => {
    mocks.revokeAllOtherAccountSessions.mockResolvedValue({
      status: "revocation_failed",
      internalReason: "database detail",
    });

    const response = await POSTBulk(bulkRequest(validBulkBody));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      status: "revocation_failed",
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { outcome: "revoke_other_sessions_failed" },
      "account security bulk session revocation completed",
    );
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(
      "database detail",
    );
  });

  it("logs only one fixed outcome without identity, selector, count, duration, or retry data", async () => {
    await POSTBulk(bulkRequest(validBulkBody));

    expect(mocks.loggerInfo.mock.calls[0]?.[0]).toEqual({
      outcome: "revoke_other_sessions_completed",
    });
    const serializedLogs = JSON.stringify([
      ...mocks.loggerInfo.mock.calls,
      ...mocks.loggerWarn.mock.calls,
    ]);
    for (const forbiddenValue of [
      "current-session-token",
      "csrf-proof",
      "forbidden-selector",
      "forbidden-user",
      "forbidden@example.test",
      '"sessionId":',
      '"selector":',
      '"userId":',
      '"email":',
      '"count":',
      '"duration":',
      '"retry":',
    ]) {
      expect(serializedLogs).not.toContain(forbiddenValue);
    }
  });
});