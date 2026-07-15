import "server-only";

import type { Logger } from "pino";

type PrismaLogEvent = {
  message: string;
  target: string;
};

export type PrismaLogEmitter = {
  $on(
    level: "warn" | "error",
    callback: (event: PrismaLogEvent) => void,
  ): unknown;
};

export function registerPrismaLogging(client: PrismaLogEmitter, logger: Logger): void {
  const log = logger.child({ component: "prisma" });

  client.$on("warn", (event) => {
    log.warn({ target: event.target }, event.message);
  });
  client.$on("error", (event) => {
    log.error({ target: event.target }, event.message);
  });
}