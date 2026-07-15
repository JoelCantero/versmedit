import { defineConfig, devices } from "@playwright/test";

const appPort = Number(process.env.E2E_APP_PORT ?? "3100");
const baseURL = `http://127.0.0.1:${appPort}`;
const distDir = process.env.NEXT_DIST_DIR ?? ".next";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `node ${distDir}/standalone/server.js`,
    env: {
      PROJECT_NAME: process.env.PROJECT_NAME ?? "playwright",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://playwright:playwright@127.0.0.1:5432/playwright?schema=public",
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "playwright-secret-not-used-in-runtime-000",
      TRUST_PROXY_HEADERS: "false",
      NEXTAUTH_URL: baseURL,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(appPort),
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});