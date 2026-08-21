// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  tokenFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  isCanonicalRequestOrigin: vi.fn(),
  hashAccountDeletionToken: vi.fn(() => "stored-hash"),
  runWithAccountDeletionVerification: vi.fn((_authorization, callback) => callback()),
  env: {
    NEXTAUTH_URL: "https://app.example.test",
    AUTH_SECRET: "verify-test-secret-at-least-32-characters",
  },
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ GET: mocks.authGet }));
vi.mock("@/lib/db", () => ({
  db: {
    verificationToken: { findUnique: mocks.tokenFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("@/lib/request-context", () => ({
  isCanonicalRequestOrigin: mocks.isCanonicalRequestOrigin,
}));
vi.mock("@/modules/account/deletion/token", () => ({
  hashAccountDeletionToken: mocks.hashAccountDeletionToken,
}));
vi.mock("@/modules/account/deletion/verification-context", () => ({
  runWithAccountDeletionVerification:
    mocks.runWithAccountDeletionVerification,
}));

import { GET } from "@/app/api/account/deletion/verify/route";

describe("GET /api/account/deletion/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
  });

  it("redirects malformed links generically without database or Auth.js work", async () => {
    const response = await GET(
      new NextRequest("https://app.example.test/api/account/deletion/verify?token=short"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account/data?state=invalid_link",
    );
    expect(mocks.tokenFindUnique).not.toHaveBeenCalled();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("delegates an exact delivered token and permits only the fixed localized intent", async () => {
    const rawToken = "a".repeat(43);
    mocks.tokenFindUnique.mockResolvedValue({
      identifier: "active@example.test",
      token: "stored-hash",
      purpose: "ACCOUNT_DELETION",
      locale: "es",
      deliveredAt: new Date(),
      expires: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: "active-user", status: "ACTIVE" });
    mocks.authGet
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(
        Response.redirect(
          "https://app.example.test/es/account/data?intent=delete",
          302,
        ),
      );

    const response = await GET(
      new NextRequest(
        `https://app.example.test/api/account/deletion/verify?token=${rawToken}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/data?intent=delete",
    );
    expect(mocks.hashAccountDeletionToken).toHaveBeenCalledWith(
      rawToken,
      mocks.env.AUTH_SECRET,
    );
    expect(mocks.runWithAccountDeletionVerification).toHaveBeenCalledWith(
      { identifier: "active@example.test", token: "stored-hash" },
      expect.any(Function),
    );
    const delegatedRequest = mocks.authGet.mock.calls[1]?.[0] as NextRequest;
    expect(delegatedRequest.nextUrl.pathname).toBe(
      "/api/auth/callback/account-deletion",
    );
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).toBe(
      "/es/account/data?intent=delete",
    );
  });

  it.each([
    ["missing", null],
    [
      "expired",
      {
        identifier: "active@example.test",
        token: "stored-hash",
        purpose: "ACCOUNT_DELETION",
        locale: "ca",
        deliveredAt: new Date(),
        expires: new Date(Date.now() - 1),
      },
    ],
    [
      "provisional",
      {
        identifier: "active@example.test",
        token: "stored-hash",
        purpose: "ACCOUNT_DELETION",
        locale: "ca",
        deliveredAt: null,
        expires: new Date(Date.now() + 60_000),
      },
    ],
    [
      "wrong-purpose",
      {
        identifier: "active@example.test",
        token: "stored-hash",
        purpose: "LOGIN",
        locale: null,
        deliveredAt: null,
        expires: new Date(Date.now() + 60_000),
      },
    ],
  ])("redirects a %s credential to the generic invalid state", async (_case, token) => {
    mocks.tokenFindUnique.mockResolvedValue(token);
    const response = await GET(
      new NextRequest(
        `https://app.example.test/api/account/deletion/verify?token=${"a".repeat(43)}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      token && token.locale === "ca"
        ? "https://app.example.test/ca/account/data?state=invalid_link"
        : "https://app.example.test/account/data?state=invalid_link",
    );
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("rejects a valid link when the browser is signed in to another account", async () => {
    mocks.tokenFindUnique.mockResolvedValue({
      identifier: "target@example.test",
      token: "stored-hash",
      purpose: "ACCOUNT_DELETION",
      locale: "es",
      deliveredAt: new Date(),
      expires: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: "target-user", status: "ACTIVE" });
    mocks.authGet.mockResolvedValueOnce(
      Response.json({ user: { id: "different-user" } }),
    );

    const response = await GET(
      new NextRequest(
        `https://app.example.test/api/account/deletion/verify?token=${"a".repeat(43)}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/account/data?state=session_conflict",
    );
    expect(mocks.authGet).toHaveBeenCalledOnce();
    expect(mocks.runWithAccountDeletionVerification).not.toHaveBeenCalled();
  });

  it("rejects an Auth.js response that leaves the fixed localized intent", async () => {
    mocks.tokenFindUnique.mockResolvedValue({
      identifier: "active@example.test",
      token: "stored-hash",
      purpose: "ACCOUNT_DELETION",
      locale: "en",
      deliveredAt: new Date(),
      expires: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: "active-user", status: "ACTIVE" });
    mocks.authGet
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(Response.redirect("https://attacker.example/", 302));

    const response = await GET(
      new NextRequest(
        `https://app.example.test/api/account/deletion/verify?token=${"a".repeat(43)}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account/data?state=invalid_link",
    );
  });
});