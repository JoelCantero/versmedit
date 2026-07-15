// @vitest-environment node

import type { DestinationStream } from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("createLogger", () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      PROJECT_NAME: "test-app",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      AUTH_SECRET: "test-auth-secret-at-least-32-chars-long",
      NEXTAUTH_URL: "https://app.example.test",
      NODE_ENV: "test",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses the configured app name and redacts sensitive fields", async () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(chunk) {
        lines.push(chunk);
      },
    };
    const { createLogger } = await import("@/lib/logger");
    const logger = createLogger(process.env, destination);

    logger.info(
      {
        DATABASE_URL: "postgresql://secret",
        user: { password: "hunter2" },
      },
      "configured",
    );

    const entry = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(entry).toMatchObject({
      app: "test-app",
      env: "test",
      level: "info",
      DATABASE_URL: "[redacted]",
      user: { password: "[redacted]" },
      msg: "configured",
    });
  });

  it("creates a child logger with request context", async () => {
    const { getRequestLogger } = await import("@/lib/logger");
    const request = new Request("https://example.test/api/health", {
      headers: { "x-request-id": "request-42" },
    });

    const requestLogger = getRequestLogger(request, { route: "/api/health" });

    expect(requestLogger.bindings()).toMatchObject({
      requestId: "request-42",
      route: "/api/health",
    });
  });
});