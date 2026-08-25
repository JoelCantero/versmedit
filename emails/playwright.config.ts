import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "../tests/e2e",
  testMatch: "email-preview-catalog.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "preview-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev emails --hostname 127.0.0.1 --port 3001",
    cwd: "..",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});