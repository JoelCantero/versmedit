import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 moves the datasource connection URL out of schema.prisma into this file.
// We read `process.env.DATABASE_URL` directly (instead of the throwing `env()` helper) so that
// `prisma generate` still works when DATABASE_URL is absent (e.g. CI type-checking). Commands that
// actually touch the database (migrate, db push, studio) require a real URL at runtime.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
