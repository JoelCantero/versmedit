// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $queryRaw: mocks.queryRaw },
}));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ error: mocks.logError }),
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  const request = new Request("https://example.test/api/health");

  beforeEach(() => {
    mocks.queryRaw.mockReset();
    mocks.logError.mockReset();
  });

  it("reports a healthy database", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{ result: 1 }]);

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", database: "ok" });
  });

  it("returns 503 and logs the server error when the database is unavailable", async () => {
    const error = new Error("connection failed");
    mocks.queryRaw.mockRejectedValueOnce(error);

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "error",
      database: "unreachable",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      { err: error },
      "health check failed: database unreachable",
    );
  });
});