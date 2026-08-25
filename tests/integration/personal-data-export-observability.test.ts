// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  sharedLimit: vi.fn(),
  csrf: vi.fn(() => true),
  canonical: vi.fn(() => true),
  session: vi.fn((): string | null => "opaque-session"),
  requestLimit: vi.fn(async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 900 })),
  confirmationLimit: vi.fn(async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 900 })),
  issue: vi.fn(async (): Promise<
    | { status: "sent" }
    | { status: "unavailable" }
    | { status: "rate_limited"; retryAfter: number }
  > => ({ status: "sent" })),
  verify: vi.fn(async (): Promise<
    | { status: "ready"; locale: "en" }
    | { status: "invalid"; locale: "en" }
    | {
        status: "invalid";
        locale: "en";
        auditOutcome: "confirmation_expired";
      }
      | { status: "rate_limited"; locale: "en"; retryAfter: number }
  > => ({ status: "ready", locale: "en" })),
  generate: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    PROJECT_NAME: "Observability Test",
    NEXTAUTH_URL: "https://app.example.test",
    AUTH_SECRET: "observability-secret-at-least-32-chars",
    MAIL: {
      enabled: true,
      brand: {
        productName: "Observability Test",
        canonicalOrigin: "https://app.example.test",
        primaryColor: "#0057B8",
        actionForeground: "#FFFFFF",
        supportEmail: "support@example.test",
        legalName: "Example Workspace, S.L.",
        legalAddress: "123 Example Street, Example City",
        logoUrl: "https://assets.example.test/mail/logo.png",
      },
    },
  }),
}));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ info: mocks.info, warn: mocks.warn }),
}));
vi.mock("@/lib/email/index", () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeSharedRateLimit: mocks.sharedLimit,
}));
vi.mock("@/lib/auth-csrf", () => ({ validateAuthCsrfToken: mocks.csrf }));
vi.mock("@/lib/request-context", () => ({
  isCanonicalRequestOrigin: mocks.canonical,
  getClientIdentifier: () => "forbidden-client-address",
}));
vi.mock("@/modules/account/session", () => ({
  readAccountSessionToken: mocks.session,
}));
vi.mock("@/modules/account/data-export/rate-limit", () => ({
  consumePersonalDataExportRequestClientLimit: mocks.requestLimit,
  consumePersonalDataExportConfirmationClientLimit: mocks.confirmationLimit,
}));
vi.mock("@/modules/account/data-export/service", () => ({
  issuePersonalDataExport: mocks.issue,
  verifyPersonalDataExport: mocks.verify,
  generatePersonalDataExport: mocks.generate,
}));

import { POST as download } from "@/app/api/account/data-export/download/route";
import { POST as requestExport } from "@/app/api/account/data-export/request/route";
import { GET as verifyExport } from "@/app/api/account/data-export/verify/route";

const rawToken = Buffer.alloc(32, 7).toString("base64url");

function request(path: string, method = "POST") {
  return new NextRequest(`https://app.example.test${path}`, {
    method,
    headers: {
      host: "app.example.test",
      origin: "https://app.example.test",
      cookie: "next-auth.session-token=opaque-session; next-auth.csrf-token=fixture",
      "content-type": "application/json",
    },
    body: method === "POST" ? JSON.stringify({ csrfToken: "proof", locale: "en" }) : undefined,
  });
}

describe("personal data export observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendTransactionalEmail.mockResolvedValue({ accepted: true });
    mocks.sharedLimit.mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 900,
    });
    mocks.issue.mockResolvedValue({ status: "sent" });
    mocks.verify.mockResolvedValue({ status: "ready", locale: "en" });
    mocks.generate.mockResolvedValue({
      status: "completed",
      export: {
        envelope: {
          schemaVersion: 1,
          generatedAt: "2026-08-23T12:00:00.000Z",
          manifest: { includedSections: [], unavailableSections: [] },
          sections: {},
        },
        json: "{}",
        bytes: new TextEncoder().encode("{}"),
        byteLength: 2,
      },
    });
  });

  it("emits only fixed successful outcomes and non-negative durations", async () => {
    await requestExport(request("/api/account/data-export/request"));
    await verifyExport(request(`/api/account/data-export/verify?token=${rawToken}&locale=en`, "GET"));
    await download(request("/api/account/data-export/download"));

    expect(mocks.info.mock.calls.map(([fields]) => fields)).toEqual([
      { outcome: "request_sent", durationMs: expect.any(Number) },
      { outcome: "confirmation_completed", durationMs: expect.any(Number) },
      { outcome: "download_completed", durationMs: expect.any(Number) },
    ]);
    const serialized = JSON.stringify([...mocks.info.mock.calls, ...mocks.warn.mock.calls]);
    for (const forbidden of [
      rawToken,
      "opaque-session",
      "forbidden-client-address",
      "email",
      "sessionId",
      "filename",
      "account",
      "payload",
      "retryAfter",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses only the fixed generic failure outcomes", async () => {
    mocks.issue.mockResolvedValue({ status: "unavailable" });
    mocks.verify.mockResolvedValue({ status: "invalid", locale: "en" });
    mocks.generate.mockResolvedValue({ status: "unavailable" });

    await requestExport(request("/api/account/data-export/request"));
    await verifyExport(request(`/api/account/data-export/verify?token=${rawToken}&locale=en`, "GET"));
    await download(request("/api/account/data-export/download"));

    expect(mocks.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { outcome: "request_failed", durationMs: expect.any(Number) },
      { outcome: "confirmation_rejected", durationMs: expect.any(Number) },
      { outcome: "generation_failed", durationMs: expect.any(Number) },
    ]);
  });

  it("distinguishes sanitized expiry and contributor failure without changing public responses", async () => {
    mocks.verify.mockResolvedValue({
      status: "invalid",
      locale: "en",
      auditOutcome: "confirmation_expired",
    });
    mocks.generate.mockResolvedValue({
      status: "unavailable",
      auditOutcome: "contributor_failed",
    });

    const confirmationResponse = await verifyExport(
      request(
        `/api/account/data-export/verify?token=${rawToken}&locale=en`,
        "GET",
      ),
    );
    const generationResponse = await download(
      request("/api/account/data-export/download"),
    );

    expect(confirmationResponse.headers.get("location")).toBe(
      "https://app.example.test/account/data?exportState=invalid",
    );
    expect(generationResponse.status).toBe(503);
    await expect(generationResponse.json()).resolves.toEqual({
      status: "unavailable",
    });
    expect(mocks.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { outcome: "confirmation_expired", durationMs: expect.any(Number) },
      { outcome: "contributor_failed", durationMs: expect.any(Number) },
    ]);
  });

  it("emits operation-specific rate limits and generation expiry", async () => {
    mocks.issue.mockResolvedValue({
      status: "rate_limited",
      retryAfter: 47,
    });
    mocks.verify.mockResolvedValue({
      status: "rate_limited",
      locale: "en",
      retryAfter: 41,
    });
    mocks.generate
      .mockResolvedValueOnce({ status: "rate_limited", retryAfter: 31 })
      .mockResolvedValueOnce({ status: "not_ready" });

    const requestResponse = await requestExport(
      request("/api/account/data-export/request"),
    );
    const confirmationResponse = await verifyExport(
      request(
        `/api/account/data-export/verify?token=${rawToken}&locale=en`,
        "GET",
      ),
    );
    const limitedGenerationResponse = await download(
      request("/api/account/data-export/download"),
    );
    const expiredGenerationResponse = await download(
      request("/api/account/data-export/download"),
    );

    expect(requestResponse.status).toBe(429);
    expect(confirmationResponse.headers.get("location")).toContain(
      "exportState=rate_limited&retryAfter=41",
    );
    expect(limitedGenerationResponse.status).toBe(429);
    expect(expiredGenerationResponse.status).toBe(409);
    expect(mocks.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { outcome: "request_rate_limited", durationMs: expect.any(Number) },
      { outcome: "confirmation_rate_limited", durationMs: expect.any(Number) },
      { outcome: "generation_rate_limited", durationMs: expect.any(Number) },
      { outcome: "generation_expired", durationMs: expect.any(Number) },
    ]);
  });

  it("opts composed export dependencies out of non-contract operational logs", async () => {
    const email = await vi.importActual<
      typeof import("@/modules/account/data-export/email")
    >("@/modules/account/data-export/email");
    await email.sendPersonalDataExportEmail({
      recipient: "private@example.test",
      rawToken: Buffer.alloc(32, 9).toString("base64url"),
      locale: "es",
      origin: "https://app.example.test",
    });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      undefined,
      { logAttempt: false },
    );

    const limits = await vi.importActual<
      typeof import("@/modules/account/data-export/rate-limit")
    >("@/modules/account/data-export/rate-limit");
    await Promise.all([
      limits.consumePersonalDataExportRequestClientLimit("client"),
      limits.consumePersonalDataExportRequestAccountLimit("person@example.test"),
      limits.consumePersonalDataExportConfirmationClientLimit("client"),
      limits.consumePersonalDataExportGenerationSessionLimit("session"),
    ]);
    expect(mocks.sharedLimit).toHaveBeenCalledTimes(4);
    for (const [options] of mocks.sharedLimit.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({ logCleanupErrors: false }),
      );
    }
  });
});