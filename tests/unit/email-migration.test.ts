// @vitest-environment node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

async function combinedContents(files: string[]) {
  return (
    await Promise.all(
      files.map(async (file) => `\n--- ${path.relative(root, file)} ---\n${await readFile(file, "utf8")}`),
    )
  ).join("\n");
}

describe("completed HTTP email migration", () => {
  it("adds no Prisma migration for presentation, previews, or delivery storage", async () => {
    const migrationsRoot = path.join(root, "prisma/migrations");
    const migrationDirectories = (await readdir(migrationsRoot, {
      withFileTypes: true,
    }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();

    expect(migrationDirectories).toEqual([
      "20260710195219_init",
      "20260711073537_add_authjs_models",
      "20260714143000_add_rate_limit_buckets",
      "20260818000000_add_signup_lifecycle",
      "20260819000000_add_signup_delivery_confirmation",
      "20260821000000_add_account_deletion_auth",
      "20260821010000_add_account_session_management",
      "20260823000000_add_personal_data_export",
      "20260901080434_add_login_access_code",
    ]);

    const migrationSource = await combinedContents(
      await Promise.all(
        migrationDirectories.map((directory) =>
          filesUnder(path.join(migrationsRoot, directory)),
        ),
      ).then((files) => files.flat()),
    );
    expect(migrationSource).not.toMatch(
      /EmailBrand|EmailTemplate|EmailMessage|emailVariant|emailSubject|emailHtml|emailText|providerMessageId/u,
    );
  });

  it("contains no application or E2E SMTP/Nodemailer path", async () => {
    const sourceFiles = (await filesUnder(path.join(root, "src"))).filter((file) =>
      /\.(?:ts|tsx)$/.test(file),
    );
    const e2eFiles = (await filesUnder(path.join(root, "tests/e2e"))).filter((file) =>
      /\.(?:ts|mjs)$/.test(file),
    );
    const source = await combinedContents([...sourceFiles, ...e2eFiles]);

    expect(source).not.toMatch(/(?:from|require\s*\()\s*["'](?:nodemailer|smtp-server)/i);
    expect(source).not.toMatch(/\b(?:E2E_)?SMTP_[A-Z0-9_]+\b|\bAUTH_EMAIL_ENABLED\b/);
  });

  it("contains no legacy runtime or deployment variable", async () => {
    const files = [
      ".env.example",
      "docker-compose.prod.yml",
      ".github/workflows/deploy.yml",
      "playwright.config.ts",
      "scripts/test-e2e.sh",
      "README.md",
    ].map((file) => path.join(root, file));
    const runtimeConfiguration = await combinedContents(files);

    expect(runtimeConfiguration).not.toMatch(/\bSMTP_[A-Z0-9_]+\b|\bAUTH_EMAIL_ENABLED\b/);
    expect(runtimeConfiguration).not.toMatch(
      /\b(?:MAIL|BREVO|MAILJET|PROVIDER)_(?:API_)?(?:URL|ENDPOINT)\b/,
    );
  });

  it("installs no direct or transitive Nodemailer/SMTP fixture package", async () => {
    const packageJson = await readFile(path.join(root, "package.json"), "utf8");
    const workspace = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
    const lockfile = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
    const manifests = `${packageJson}\n${workspace}`;

    expect(manifests).not.toMatch(
      /(?:^|[\s"'])@?types\/nodemailer|(?:^|[\s"'])nodemailer(?:@|["':])|smtp-server/i,
    );
    expect(lockfile).not.toMatch(
      /^  (?:'@types\/nodemailer@|nodemailer@|smtp-server@)/m,
    );
  });

  it("adds no provider webhook or runtime endpoint override", async () => {
    const appFiles = await filesUnder(path.join(root, "src/app"));
    expect(appFiles.map((file) => path.relative(root, file))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/webhook/i)]),
    );

    const source = await combinedContents(
      (await filesUnder(path.join(root, "src"))).filter((file) => /\.(?:ts|tsx)$/.test(file)),
    );
    expect(source).not.toMatch(
      /process\.env\.(?:MAIL|BREVO|MAILJET|PROVIDER)_(?:API_)?(?:URL|ENDPOINT)/,
    );
  });
});
