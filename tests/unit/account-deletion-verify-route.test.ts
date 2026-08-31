// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  isCanonicalRequestOrigin: vi.fn(),
  preflightAccountDeletionVerification: vi.fn(),
  evaluateAccountDeletionVerificationSession: vi.fn(),
  runWithAccountDeletionVerification: vi.fn((_authorization, callback) => callback()),
  env: {
    NEXTAUTH_URL: "https://app.example.test",
    AUTH_SECRET: "verify-test-secret-at-least-32-characters",
  },
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ GET: mocks.authGet }));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("@/lib/request-context", () => ({
  isCanonicalRequestOrigin: mocks.isCanonicalRequestOrigin,
}));
vi.mock("@/modules/account/deletion/service", () => ({
  preflightAccountDeletionVerification:
    mocks.preflightAccountDeletionVerification,
  evaluateAccountDeletionVerificationSession:
    mocks.evaluateAccountDeletionVerificationSession,
}));
vi.mock("@/modules/account/deletion/verification-context", () => ({
  runWithAccountDeletionVerification:
    mocks.runWithAccountDeletionVerification,
}));

import { GET } from "@/app/api/account/deletion/verify/route";

const rawToken = "a".repeat(43);
const candidate = {
  userId: "active-user",
  identifier: "active@example.test",
  tokenHash: "stored-hash",
  locale: "es" as const,
};

function request(query = `token=${rawToken}`, headers?: HeadersInit) {
  return new NextRequest(
    `https://app.example.test/api/account/deletion/verify?${query}`,
    { headers },
  );
}

describe("GET /api/account/deletion/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.preflightAccountDeletionVerification.mockResolvedValue({
      status: "eligible_candidate",
      candidate,
    });
    mocks.evaluateAccountDeletionVerificationSession.mockReturnValue({
      status: "eligible",
      candidate,
    });
    mocks.authGet.mockImplementation((delegatedRequest: NextRequest) => {
      if (delegatedRequest.nextUrl.pathname === "/api/auth/session") {
        return Promise.resolve(Response.json(null));
      }
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://app.example.test/es/account/data?intent=delete",
            "set-cookie":
              "__Secure-next-auth.session-token=session; Path=/; HttpOnly; Secure",
          },
        }),
      );
    });
  });

  it("redirects malformed links generically without database or Auth.js work", async () => {
    const response = await GET(
      new NextRequest("https://app.example.test/api/account/deletion/verify?token=short"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account/data?state=invalid_link",
    );
    expect(mocks.preflightAccountDeletionVerification).not.toHaveBeenCalled();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical request before domain verification", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(421);
    await expect(response.json()).resolves.toEqual({
      status: "misdirected_request",
    });
    expect(mocks.preflightAccountDeletionVerification).not.toHaveBeenCalled();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("delegates an exact delivered token and permits only the fixed localized intent", async () => {
    const response = await GET(
      request(`token=${rawToken}&callbackUrl=https://attacker.example`, {
        "x-request-id": "deletion-request",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/data?intent=delete",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "next-auth.session-token",
    );
    expect(mocks.preflightAccountDeletionVerification).toHaveBeenCalledWith(
      rawToken,
    );
    expect(mocks.evaluateAccountDeletionVerificationSession).toHaveBeenCalledWith(
      candidate,
      null,
    );
    expect(mocks.runWithAccountDeletionVerification).toHaveBeenCalledWith(
      { identifier: candidate.identifier, token: candidate.tokenHash },
      expect.any(Function),
    );
    const delegatedRequest = mocks.authGet.mock.calls[1]?.[0] as NextRequest;
    expect(delegatedRequest.nextUrl.pathname).toBe(
      "/api/auth/callback/account-deletion",
    );
    expect(delegatedRequest.nextUrl.searchParams.get("token")).toBe(rawToken);
    expect(delegatedRequest.nextUrl.searchParams.get("email")).toBe(
      candidate.identifier,
    );
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).toBe(
      "/es/account/data?intent=delete",
    );
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).not.toContain(
      "attacker",
    );
    expect(delegatedRequest.headers.get("x-request-id")).toBe(
      "deletion-request",
    );
  });

  it.each(["en", "ca"] as const)(
    "translates an invalid preflight to the %s generic state",
    async (locale) => {
      mocks.preflightAccountDeletionVerification.mockResolvedValue({
        status: "invalid_link",
        locale,
      });

      const response = await GET(request());

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        locale === "ca"
          ? "https://app.example.test/ca/account/data?state=invalid_link"
          : "https://app.example.test/account/data?state=invalid_link",
      );
      expect(mocks.authGet).not.toHaveBeenCalled();
      expect(
        mocks.evaluateAccountDeletionVerificationSession,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects a valid link when the browser is signed in to another account", async () => {
    mocks.evaluateAccountDeletionVerificationSession.mockReturnValue({
      status: "session_conflict",
      locale: candidate.locale,
    });
    mocks.authGet.mockResolvedValueOnce(
      Response.json({ user: { id: "different-user" } }),
    );

    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/data?state=session_conflict",
    );
    expect(mocks.authGet).toHaveBeenCalledOnce();
    expect(mocks.evaluateAccountDeletionVerificationSession).toHaveBeenCalledWith(
      candidate,
      "different-user",
    );
    expect(mocks.runWithAccountDeletionVerification).not.toHaveBeenCalled();
  });

  it("rejects an Auth.js response that leaves the fixed localized intent", async () => {
    mocks.preflightAccountDeletionVerification.mockResolvedValue({
      status: "eligible_candidate",
      candidate: { ...candidate, locale: "en" },
    });
    mocks.evaluateAccountDeletionVerificationSession.mockReturnValue({
      status: "eligible",
      candidate: { ...candidate, locale: "en" },
    });
    mocks.authGet
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(Response.redirect("https://attacker.example/", 302));

    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account/data?state=invalid_link",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("maps a thrown Auth.js callback to the generic localized state", async () => {
    mocks.authGet.mockImplementation((delegatedRequest: NextRequest) =>
      delegatedRequest.nextUrl.pathname === "/api/auth/session"
        ? Promise.resolve(Response.json(null))
        : Promise.reject(new Error("provider failure")),
    );

    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/data?state=invalid_link",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});