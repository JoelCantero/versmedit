// @vitest-environment node

import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { validateEnv } from "@/lib/env";

const originalEnv = process.env;

function validEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PROJECT_NAME: "personal-data-export-test",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
    AUTH_SECRET: "test-auth-secret-at-least-32-chars-long",
    NEXTAUTH_URL: "https://app.example.test",
    ...overrides,
  };
}

afterEach(() => {
  process.env = originalEnv;
});

describe("personal data export configuration", () => {
  it("uses bounded non-sensitive defaults", () => {
    expect(validateEnv(validEnv())).toMatchObject({
      ACCOUNT_DATA_EXPORT_MAX_BYTES: 26_214_400,
      ACCOUNT_DATA_EXPORT_TIMEOUT_MS: 30_000,
    });
  });

  it("accepts positive safe integer overrides", () => {
    expect(
      validateEnv(
        validEnv({
          ACCOUNT_DATA_EXPORT_MAX_BYTES: "1048576",
          ACCOUNT_DATA_EXPORT_TIMEOUT_MS: "5000",
        }),
      ),
    ).toMatchObject({
      ACCOUNT_DATA_EXPORT_MAX_BYTES: 1_048_576,
      ACCOUNT_DATA_EXPORT_TIMEOUT_MS: 5_000,
    });
  });

  it.each(["0", "-1", "1.5", "NaN", "9007199254740992", " 5000 "])(
    "rejects an invalid byte limit %j",
    (value) => {
      expect(() =>
        validateEnv(validEnv({ ACCOUNT_DATA_EXPORT_MAX_BYTES: value })),
      ).toThrow(/ACCOUNT_DATA_EXPORT_MAX_BYTES/u);
    },
  );

  it.each(["0", "-1", "1.5", "NaN", "9007199254740992", " 5000 "])(
    "rejects an invalid timeout %j",
    (value) => {
      expect(() =>
        validateEnv(validEnv({ ACCOUNT_DATA_EXPORT_TIMEOUT_MS: value })),
      ).toThrow(/ACCOUNT_DATA_EXPORT_TIMEOUT_MS/u);
    },
  );

  it("documents and propagates both values through production and E2E wiring", async () => {
    const [example, compose, deploy, playwright] = await Promise.all([
      readFile(".env.example", "utf8"),
      readFile("docker-compose.prod.yml", "utf8"),
      readFile(".github/workflows/deploy.yml", "utf8"),
      readFile("playwright.config.ts", "utf8"),
    ]);
    for (const name of [
      "ACCOUNT_DATA_EXPORT_MAX_BYTES",
      "ACCOUNT_DATA_EXPORT_TIMEOUT_MS",
    ]) {
      expect(example).toContain(name);
      expect(compose).toContain(name);
      expect(deploy).toContain(name);
      expect(playwright).toContain(name);
    }
    expect(example).toContain("ACCOUNT_DATA_EXPORT_MAX_BYTES=26214400");
    expect(example).toContain("ACCOUNT_DATA_EXPORT_TIMEOUT_MS=30000");
  });
});