// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const brandFields = [
  "MAIL_BRAND_COLOR",
  "MAIL_SUPPORT_EMAIL",
  "MAIL_LEGAL_NAME",
  "MAIL_LEGAL_ADDRESS",
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
  it("forwards all five brand variables to app and nowhere else in Compose", async () => {
    const compose = await readFile("docker-compose.prod.yml", "utf8");
    const app = between(compose, "  app:\n", "  migrate:\n");
    const migrate = between(compose, "  migrate:\n", "  db:\n");
    const database = between(compose, "  db:\n", "networks:\n");

    for (const field of brandFields) {
      expect(app).toContain(`- ${field}`);
      expect(migrate).not.toContain(field);
      expect(database).not.toContain(field);
    }
    expect(compose).not.toMatch(/build:\s*[\s\S]*?args:[\s\S]*?MAIL_(?:BRAND|SUPPORT|LEGAL|LOGO)/u);
  });

  it("uses GitHub Variables, conditionally requires four fields, and never uses secrets", async () => {
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
    for (const field of brandFields.slice(0, 4)) {
      expect(preflight).toContain(
        `[ -n "$${field}" ] || missing+=("${field} (Variable)")`,
      );
    }
    expect(preflight).not.toContain(
      `[ -n "$MAIL_LOGO_URL" ] || missing+=("MAIL_LOGO_URL (Variable)")`,
    );
    expect(preflight.indexOf('if [ "$MAIL_ENABLED" = "true" ]; then')).toBeLessThan(
      preflight.indexOf('[ -n "$MAIL_BRAND_COLOR" ]'),
    );
  });

  it("keeps brand variables out of Docker build inputs", async () => {
    const [dockerfile, compose] = await Promise.all([
      readFile("docker/Dockerfile", "utf8"),
      readFile("docker-compose.prod.yml", "utf8"),
    ]);

    for (const field of brandFields) {
      expect(dockerfile).not.toContain(field);
      const buildSections = compose.match(/build:\n(?: {6,}.*\n)*/gu) ?? [];
      expect(buildSections.join("\n")).not.toContain(field);
    }
  });
});