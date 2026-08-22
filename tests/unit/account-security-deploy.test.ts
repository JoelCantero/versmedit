// @vitest-environment node

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const root = process.cwd();
const workflowPath = path.join(root, ".github/workflows/deploy.yml");

async function readDeployScript() {
  const workflow = await readFile(workflowPath, "utf8");
  const lines = workflow.split("\n");
  const stepIndex = lines.findIndex((line) =>
    line.includes("name: Build and deploy with Docker Compose"),
  );
  const runIndex = lines.findIndex(
    (line, index) => index > stepIndex && line.trim() === "run: |",
  );
  const scriptLines: string[] = [];
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.startsWith("      - name:")) break;
    if (line === "" || line.startsWith("          ")) {
      scriptLines.push(line.startsWith("          ") ? line.slice(10) : line);
    }
  }
  return { workflow, script: scriptLines.join("\n").trim() };
}

describe("account security deployment ordering", () => {
  it("prebuilds, quiesces the app, migrates synchronously, and force recreates only the app", async () => {
    const { workflow, script } = await readDeployScript();
    const composeCommands = script
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("docker compose"));

    expect(script).toContain("set -Eeuo pipefail");
    expect(composeCommands).toEqual([
      "docker compose -f docker-compose.prod.yml build app migrate",
      "docker compose -f docker-compose.prod.yml up -d --wait db",
      "docker compose -f docker-compose.prod.yml stop app",
      "docker compose -f docker-compose.prod.yml rm -f migrate",
      "docker compose -f docker-compose.prod.yml run --rm --no-deps migrate",
      "docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate --remove-orphans app",
    ]);
    expect(workflow.indexOf("Build and deploy with Docker Compose")).toBeLessThan(
      workflow.indexOf("Verify app health"),
    );
    expect(script).toContain('export DATABASE_URL="postgresql://${db_user}:${db_password}@db:5432/${db_name}?schema=public"');
    expect(script).toContain('export NEXTAUTH_URL="https://${APP_DOMAIN}"');
  });

  it("does not restart the app after a synchronous migration failure", async () => {
    const { script } = await readDeployScript();
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "account-security-deploy-"),
    );
    const fakeDocker = path.join(temporaryDirectory, "docker");
    const dockerLog = path.join(temporaryDirectory, "docker.log");
    await writeFile(
      fakeDocker,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
if [ "$*" = "compose -f docker-compose.prod.yml run --rm --no-deps migrate" ]; then
  exit 23
fi
exit 0
`,
    );
    await chmod(fakeDocker, 0o755);

    try {
      await expect(
        executeFile("/bin/bash", ["-c", script], {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${temporaryDirectory}:${process.env.PATH ?? ""}`,
            DEPLOY_DIR: root,
            POSTGRES_USER: "project",
            POSTGRES_PASSWORD: "password",
            POSTGRES_DB: "project",
            APP_DOMAIN: "example.test",
            DOCKER_LOG: dockerLog,
          },
        }),
      ).rejects.toMatchObject({ code: 23 });

      const commands = await readFile(dockerLog, "utf8");
      expect(commands).toContain(
        "compose -f docker-compose.prod.yml run --rm --no-deps migrate",
      );
      expect(commands).not.toContain(
        "compose -f docker-compose.prod.yml up -d --no-deps --force-recreate --remove-orphans app",
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});