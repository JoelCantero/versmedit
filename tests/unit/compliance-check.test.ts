// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function createFeature(tasks: string, threatText = "Reviewed.") {
  const directory = await mkdtemp(join(tmpdir(), "webapp-template-compliance-"));
  temporaryDirectories.push(directory);

  await Promise.all([
    writeFile(
      join(directory, "spec.md"),
      [
        "# Feature",
        "## Non-Goals",
        "None.",
        "## Security & Privacy Implications",
        "Reviewed.",
        "## Threats & Abuse Cases",
        threatText,
      ].join("\n"),
    ),
    writeFile(
      join(directory, "plan.md"),
      [
        "# Plan",
        "## Constitution Check",
        "Passed.",
        "**Migration Strategy**: N/A",
        "**Recovery Strategy**: N/A",
      ].join("\n"),
    ),
    writeFile(join(directory, "tasks.md"), `# Tasks\n${tasks}\n`),
  ]);

  return directory;
}

async function replaceInFeature(
  directory: string,
  file: string,
  content: string,
) {
  await writeFile(join(directory, file), content);
}

async function runComplianceCheck(featureDirectory: string) {
  return execFileAsync(".specify/scripts/bash/compliance-check.sh", {
    cwd: process.cwd(),
    env: { ...process.env, SPECIFY_FEATURE_DIRECTORY: featureDirectory },
  });
}

async function runAllComplianceChecks() {
  return execFileAsync(".specify/scripts/bash/compliance-check.sh", ["--all"], {
    cwd: process.cwd(),
    env: process.env,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("compliance-check.sh", () => {
  it("accepts a template repository without feature specs", async () => {
    await expect(runAllComplianceChecks()).resolves.toMatchObject({
      stderr: expect.stringContaining("nothing to validate"),
    });
  });

  it("accepts bracketed domain language that is not a template placeholder", async () => {
    const directory = await createFeature(
      "- [X] T001 Complete",
      "The [service] label is user-visible.",
    );

    await expect(runComplianceCheck(directory)).resolves.toMatchObject({
      stderr: expect.stringContaining("comply with project governance"),
    });
  });

  it("rejects incomplete tasks regardless of indentation", async () => {
    const directory = await createFeature("  - [ ] T001 Still incomplete");

    await expect(runComplianceCheck(directory)).rejects.toMatchObject({
      stderr: expect.stringContaining("All tasks must be completed"),
    });
  });

  it("rejects unambiguous template placeholders", async () => {
    const directory = await createFeature(
      "- [X] T001 Complete",
      "[NEEDS CLARIFICATION: define abuse controls]",
    );

    await expect(runComplianceCheck(directory)).rejects.toMatchObject({
      stderr: expect.stringContaining("Resolve all template placeholders"),
    });
  });

  it("rejects required sections that contain comments only", async () => {
    const directory = await createFeature("- [X] T001 Complete");
    await replaceInFeature(
      directory,
      "spec.md",
      "# Feature\n## Non-Goals\nNone.\n## Security & Privacy Implications\n<!-- TODO -->\n## Threats & Abuse Cases\nReviewed.\n",
    );

    await expect(runComplianceCheck(directory)).rejects.toMatchObject({
      stderr: expect.stringContaining("no substantive content"),
    });
  });

  it("rejects unresolved field-value placeholders", async () => {
    const directory = await createFeature(
      "- [X] T001 Complete",
      "- **Controls**: [Describe rate limits and authorization]",
    );

    await expect(runComplianceCheck(directory)).rejects.toMatchObject({
      stderr: expect.stringContaining("Resolve all template placeholders"),
    });
  });
});