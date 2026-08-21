// @vitest-environment node

import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { registerPrismaLogging, type PrismaLogEmitter } from "@/lib/prisma-logging";

describe("registerPrismaLogging", () => {
  it("forwards sanitized Prisma warnings and errors through a contextual child logger", () => {
    const handlers = new Map<string, (event: { message: string; target: string }) => void>();
    const client = {
      $on: vi.fn((level: string, handler: (event: { message: string; target: string }) => void) => {
        handlers.set(level, handler);
      }),
    } as unknown as PrismaLogEmitter;
    const child = { warn: vi.fn(), error: vi.fn() };
    const logger = {
      child: vi.fn().mockReturnValue(child),
    } as unknown as Logger;

    registerPrismaLogging(client, logger);
    handlers.get("warn")!({ message: "pool pressure for private@example.test", target: "postgres" });
    handlers.get("error")!({ message: "query failed with token=secret", target: "postgres" });

    expect(logger.child).toHaveBeenCalledWith({ component: "prisma" });
    expect(child.warn).toHaveBeenCalledWith(
      { target: "postgres" },
      "database warning",
    );
    expect(child.error).toHaveBeenCalledWith(
      { target: "postgres" },
      "database operation failed",
    );
    expect(JSON.stringify([child.warn.mock.calls, child.error.mock.calls])).not.toContain(
      "private@example.test",
    );
    expect(JSON.stringify([child.warn.mock.calls, child.error.mock.calls])).not.toContain(
      "token=secret",
    );
    expect(client.$on).toHaveBeenCalledTimes(2);
  });
});