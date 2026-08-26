// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const brandFields = [
  "BRAND_COLOR",
  "SUPPORT_EMAIL",
  "MAIL_LOGO_URL",
] as const;

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("email runtime configuration", () => {
  it("forwards only public app branding to the opt-in local preview", async () => {
    const [packageJson, previewConfig, previewFixtures] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("emails/next.config.ts", "utf8"),
      readFile("emails/lib/preview-fixtures.ts", "utf8"),
    ]);

    expect(packageJson).toContain("EMAIL_PREVIEW_USE_APP_BRAND=true");
    for (const [previewField, appField] of Object.entries({
      EMAIL_PREVIEW_PROJECT_NAME: "PROJECT_NAME",
      EMAIL_PREVIEW_BRAND_COLOR: "BRAND_COLOR",
      EMAIL_PREVIEW_SUPPORT_EMAIL: "SUPPORT_EMAIL",
      EMAIL_PREVIEW_LOGO_URL: "MAIL_LOGO_URL",
    })) {
      expect(previewConfig).toContain(`\"${appField}\"`);
      expect(previewConfig).toContain(`process.env.${appField}`);
      expect(previewFixtures).toContain(`process.env.${previewField}`);
    }
    for (const field of [
      "DATABASE_URL",
      "AUTH_SECRET",
      "MAIL_API_KEY",
      "MAIL_API_SECRET",
    ]) {
      expect(previewConfig).not.toContain(field);
    }
  });

  it("forwards global brand variables and the optional mail logo only to app", async () => {
    const compose = await readFile("docker-compose.prod.yml", "utf8");
    const app = between(compose, "  app:\n", "  migrate:\n");
    const migrate = between(compose, "  migrate:\n", "  db:\n");
    const database = between(compose, "  db:\n", "networks:\n");

    for (const field of brandFields) {
      expect(app).toContain(`- ${field}`);
      expect(migrate).not.toContain(field);
      expect(database).not.toContain(field);
    }
    expect(compose).not.toMatch(/build:\s*[\s\S]*?args:[\s\S]*?(?:BRAND_COLOR|SUPPORT_EMAIL|MAIL_LOGO_URL)/u);
  });

  it("uses GitHub Variables, always requires global brand fields, and never uses secrets", async () => {
    const workflow = await readFile(".github/workflows/deploy.yml", "utf8");
    const preflight = between(
      workflow,
      "      - name: Validate required variables and secrets\n",
      "      - name: Ensure runner matches RUNNER_NAME\n",
    );
    const deploy = between(
      workflow,
      "      - name: Build and deploy with Docker Compose\n",
      "      - name: Verify app health\n",
    );

    for (const field of brandFields) {
      expect(preflight).toContain(`${field}: \${{ vars.${field} }}`);
      expect(deploy).toContain(`${field}: \${{ vars.${field} }}`);
      expect(workflow).not.toContain(`secrets.${field}`);
    }
    for (const field of brandFields.slice(0, 2)) {
      expect(preflight).toContain(
        `[ -n "$${field}" ] || missing+=("${field} (Variable)")`,
      );
    }
    expect(preflight).not.toContain(
      `[ -n "$MAIL_LOGO_URL" ] || missing+=("MAIL_LOGO_URL (Variable)")`,
    );
    expect(preflight.indexOf('[ -n "$BRAND_COLOR" ]')).toBeLessThan(
      preflight.indexOf('if [ "$MAIL_ENABLED" = "true" ]; then'),
    );
  });

  it("uses fixed public build placeholders without accepting production brand inputs", async () => {
    const [dockerfile, compose] = await Promise.all([
      readFile("docker/Dockerfile", "utf8"),
      readFile("docker-compose.prod.yml", "utf8"),
    ]);

    expect(dockerfile).toContain("BRAND_COLOR=#18181B");
    expect(dockerfile).toContain("SUPPORT_EMAIL=support@example.test");
    expect(dockerfile).not.toContain("MAIL_LOGO_URL");

    for (const field of brandFields) {
      expect(dockerfile).not.toContain(`ARG ${field}`);
      const buildSections = compose.match(/build:\n(?: {6,}.*\n)*/gu) ?? [];
      expect(buildSections.join("\n")).not.toContain(field);
    }
  });
});