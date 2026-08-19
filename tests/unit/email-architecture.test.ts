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

describe("transactional email architecture", () => {
  it("exposes no provider webhook route or administrative delivery view", async () => {
    const appFiles = await filesUnder(path.join(root, "src/app"));
    const relativePaths = appFiles.map((file) => path.relative(root, file));

    expect(relativePaths.filter((file) => /webhook/i.test(file))).toEqual([]);
    expect(
      relativePaths.filter(
        (file) => /admin/i.test(file) && /deliver|email-status|message-status/i.test(file),
      ),
    ).toEqual([]);
  });

  it("adds no provider-delivery product model or status field", async () => {
    const schema = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");

    expect(schema).not.toMatch(/model\s+(?:EmailDelivery|DeliveryEvent|ProviderMessage)\b/);
    expect(schema).not.toMatch(
      /^\s*(?:deliveryStatus|providerMessageId|providerStatus|bounceReason|complaintAt)\s+/m,
    );
  });

  it("keeps provider endpoints fixed in source code", async () => {
    const sourceFiles = (await filesUnder(path.join(root, "src"))).filter((file) =>
      /\.(?:ts|tsx)$/.test(file),
    );
    const source = (
      await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))
    ).join("\n");

    expect(source).not.toMatch(
      /(?:MAIL|BREVO|MAILJET|PROVIDER)_(?:API_)?(?:URL|ENDPOINT)|process\.env\.(?:BREVO|MAILJET).*URL/,
    );
  });
});
