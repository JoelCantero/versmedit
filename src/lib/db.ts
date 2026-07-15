import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { registerPrismaLogging } from "@/lib/prisma-logging";

// Prisma 7 uses driver adapters (no Rust engine); the pg adapter manages the connection pool.
// Singleton avoids exhausting DB connections during dev HMR.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const env = getEnv();

function createPrismaClient() {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: [
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });

  registerPrismaLogging(client, logger);

  return client;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
