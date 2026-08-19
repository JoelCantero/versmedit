import { defineConfig, devices } from "@playwright/test";

const appPort = Number(process.env.E2E_APP_PORT ?? "3100");
const baseURL = `http://127.0.0.1:${appPort}`;
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const smtpPort = process.env.E2E_SMTP_PORT;
const smtpEnv: Record<string, string> = smtpPort
  ? {
      AUTH_EMAIL_ENABLED: "true",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: smtpPort,
      SMTP_SECURE: "false",
      SMTP_USER: "signup-test",
      SMTP_PASSWORD: "signup-test-password",
      SMTP_FROM: "Versmedit Test <no-reply@example.test>",
    }
  : {};
const standaloneStaticAssetsCommand = [
  `mkdir -p ${distDir}/standalone/${distDir}`,
  `rm -rf ${distDir}/standalone/${distDir}/static`,
  `cp -R ${distDir}/static ${distDir}/standalone/${distDir}/static`,
  `node ${distDir}/standalone/server.js`,
].join(" && ");

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
      grepInvert: /@mobile/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-320",
      grep: /@mobile/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 900 },
      },
    },
  ],
  webServer: {
    command: standaloneStaticAssetsCommand,
    env: {
      ...process.env,
      PROJECT_NAME: process.env.PROJECT_NAME ?? "playwright",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://playwright:playwright@127.0.0.1:5432/playwright?schema=public",
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "playwright-secret-not-used-in-runtime-000",
      ...smtpEnv,
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