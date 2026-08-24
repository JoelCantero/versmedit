// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  validateAuthCsrfToken: vi.fn(),
  isCanonicalRequestOrigin: vi.fn(),
  getClientIdentifier: vi.fn(() => "203.0.113.91"),
  readAccountSessionToken: vi.fn((): string | null => "current-session-token"),
  consumeRequestClientLimit: vi.fn(),
  consumeConfirmationClientLimit: vi.fn(),
  issuePersonalDataExport: vi.fn(),
  verifyPersonalDataExport: vi.fn(),
  generatePersonalDataExport: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  env: {
    NEXTAUTH_URL: "https://app.example.test",
    AUTH_SECRET: "route-test-secret-at-least-32-characters",
    ACCOUNT_DATA_EXPORT_MAX_BYTES: 26_214_400,
    ACCOUNT_DATA_EXPORT_TIMEOUT_MS: 30_000,
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
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}));
vi.mock("@/modules/account/session", () => ({
  readAccountSessionToken: mocks.readAccountSessionToken,
}));
vi.mock("@/modules/account/data-export/rate-limit", () => ({
  consumePersonalDataExportRequestClientLimit:
    mocks.consumeRequestClientLimit,
  consumePersonalDataExportConfirmationClientLimit:
    mocks.consumeConfirmationClientLimit,
}));
vi.mock("@/modules/account/data-export/service", () => ({
  issuePersonalDataExport: mocks.issuePersonalDataExport,
  verifyPersonalDataExport: mocks.verifyPersonalDataExport,
  generatePersonalDataExport: mocks.generatePersonalDataExport,
}));

import { POST as download } from "@/app/api/account/data-export/download/route";
import { POST as requestExport } from "@/app/api/account/data-export/request/route";
import { GET as verifyExport } from "@/app/api/account/data-export/verify/route";

const validBody = { csrfToken: "csrf-proof", locale: "en" } as const;
const rawToken = Buffer.alloc(32, 4).toString("base64url");

function post(path: string, body: unknown = validBody) {
  return new NextRequest(`https://app.example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie:
        "next-auth.session-token=current-session-token; next-auth.csrf-token=fixture",
      host: "app.example.test",
      origin: "https://app.example.test",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function verify(query = `token=${rawToken}&locale=en`) {
  return new NextRequest(
    `https://app.example.test/api/account/data-export/verify?${query}`,
    {
      headers: {
        cookie: "next-auth.session-token=current-session-token",
        host: "app.example.test",
      },
    },
  );
}

function expectNoAttachmentHeaders(response: Response) {
  expect(response.headers.get("content-disposition")).toBeNull();
  expect(response.headers.get("content-length")).toBeNull();
}

describe("personal data export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.readAccountSessionToken.mockReturnValue("current-session-token");
    mocks.consumeRequestClientLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 900,
    });
    mocks.consumeConfirmationClientLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 900,
    });
    mocks.issuePersonalDataExport.mockResolvedValue({ status: "sent" });
    mocks.verifyPersonalDataExport.mockResolvedValue({
      status: "ready",
      locale: "es",
    });
    const json = '{"schemaVersion":1}';
    mocks.generatePersonalDataExport.mockResolvedValue({
      status: "completed",
      export: {
        envelope: {
          schemaVersion: 1,
          generatedAt: "2026-08-23T12:00:00.123Z",
          manifest: { includedSections: [], unavailableSections: [] },
          sections: {},
        },
        json,
        bytes: new TextEncoder().encode(json),
        byteLength: Buffer.byteLength(json),
      },
    });
    mocks.env.MAIL.enabled = true;
  });

  it("returns a no-store 202 only after session-derived request delivery", async () => {
    const response = await requestExport(
      post("/api/account/data-export/request"),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "sent" });
    expect(mocks.issuePersonalDataExport).toHaveBeenCalledWith({
      sessionToken: "current-session-token",
      locale: "en",
      origin: "https://app.example.test",
    });
  });

  it("redirects confirmation immediately without a credential or cookie", async () => {
    const response = await verifyExport(verify());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/data?exportState=ready",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("location")).not.toContain(rawToken);
    expect(mocks.verifyPersonalDataExport).toHaveBeenCalledWith({
      rawToken,
      sessionToken: "current-session-token",
      fallbackLocale: "en",
    });
  });

  it("returns a fully buffered non-cacheable attachment with exact length", async () => {
    const response = await download(
      post("/api/account/data-export/download"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="personal-data-export-20260823T120000Z.json"',
    );
    expect(response.headers.get("content-length")).toBe(
      String(Buffer.byteLength(body)),
    );
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toBe('{"schemaVersion":1}');
  });

  it.each([
    [requestExport, "/api/account/data-export/request"],
    [download, "/api/account/data-export/download"],
  ] as const)("rejects unknown and duplicate body fields before service work", async (handler, path) => {
    for (const body of [
      { ...validBody, email: "person@example.test" },
      '{"csrfToken":"csrf-proof","csrfToken":"duplicate","locale":"en"}',
    ]) {
      const response = await handler(post(path, body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
      expectNoAttachmentHeaders(response);
    }
    expect(mocks.issuePersonalDataExport).not.toHaveBeenCalled();
    expect(mocks.generatePersonalDataExport).not.toHaveBeenCalled();
  });

  it("rejects non-canonical POSTs and callbacks before protected work", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const requestResponse = await requestExport(post("/api/account/data-export/request"));
    const downloadResponse = await download(post("/api/account/data-export/download"));
    const verifyResponse = await verifyExport(verify());

    expect(requestResponse.status).toBe(403);
    expect(downloadResponse.status).toBe(403);
    expect(verifyResponse.status).toBe(421);
    expect(mocks.issuePersonalDataExport).not.toHaveBeenCalled();
    expect(mocks.verifyPersonalDataExport).not.toHaveBeenCalled();
    expect(mocks.generatePersonalDataExport).not.toHaveBeenCalled();
  });

  it.each([
    [requestExport, "/api/account/data-export/request"],
    [download, "/api/account/data-export/download"],
  ] as const)("requires CSRF and an exact Session for POST operations", async (handler, path) => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);
    const forbidden = await handler(post(path));
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({ status: "forbidden" });

    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.readAccountSessionToken.mockReturnValue(null);
    const unauthenticated = await handler(post(path, { ...validBody, locale: "ca" }));
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      status: "unauthenticated",
      redirectTo: "/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata",
    });
    expectNoAttachmentHeaders(unauthenticated);
  });

  it("rate-limits confirmation before inspecting the callback credential", async () => {
    mocks.consumeConfirmationClientLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 87,
    });

    const response = await verifyExport(verify(`token=${rawToken}&locale=ca`));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/ca/account/data?exportState=rate_limited&retryAfter=87",
    );
    expect(response.headers.get("retry-after")).toBe("87");
    expect(mocks.verifyPersonalDataExport).not.toHaveBeenCalled();
  });

  it("rate-limits requests before parsing or delivery", async () => {
    mocks.consumeRequestClientLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 73,
    });

    const response = await requestExport(
      post("/api/account/data-export/request", "not-json"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("73");
    await expect(response.json()).resolves.toEqual({
      status: "rate_limited",
      retryAfter: 73,
    });
    expect(mocks.issuePersonalDataExport).not.toHaveBeenCalled();
  });

  it.each([
    [requestExport, "/api/account/data-export/request", mocks.issuePersonalDataExport],
    [download, "/api/account/data-export/download", mocks.generatePersonalDataExport],
  ] as const)("maps a revoked Session generically for %s", async (handler, path, protectedWork) => {
    protectedWork.mockResolvedValue({ status: "unauthenticated" });

    const response = await handler(post(path, { ...validBody, locale: "es" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "unauthenticated",
      redirectTo: "/es/login?callbackUrl=%2Fes%2Faccount%2Fdata",
    });
    expectNoAttachmentHeaders(response);
  });

  it("maps rejected and replayed confirmation credentials to the same clean URL", async () => {
    mocks.verifyPersonalDataExport.mockResolvedValue({
      status: "invalid",
      locale: "ca",
    });

    const response = await verifyExport(verify());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/ca/account/data?exportState=invalid",
    );
    expect(response.headers.get("location")).not.toContain(rawToken);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ["", "/account/data?exportState=invalid"],
    [`token=${rawToken}&locale=en&email=person%40example.test`, "/account/data?exportState=invalid"],
    [`token=${rawToken}&token=${rawToken}&locale=es`, "/es/account/data?exportState=invalid"],
  ])("redirects malformed callback query %j without service work", async (query, expected) => {
    const response = await verifyExport(verify(query));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://app.example.test${expected}`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.verifyPersonalDataExport).not.toHaveBeenCalled();
  });

  it.each([
    ["not_ready", 409],
    ["unavailable", 503],
    ["rate_limited", 429],
  ] as const)("maps download %s without attachment metadata", async (status, expectedStatus) => {
    mocks.generatePersonalDataExport.mockResolvedValue(
      status === "rate_limited"
        ? { status, retryAfter: 41 }
        : { status },
    );

    const response = await download(post("/api/account/data-export/download"));

    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expectNoAttachmentHeaders(response);
    if (status === "rate_limited") {
      expect(response.headers.get("retry-after")).toBe("41");
    }
  });
});