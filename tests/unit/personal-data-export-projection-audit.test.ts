// @vitest-environment node

import type { Prisma } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canonicalJsonStringify } from "@/modules/account/data-export/serializer";
import {
  createFixtureProductContributor,
  fixtureJournalEntries,
  fixtureProductDeclaration,
} from "../fixtures/personal-data-export-product-contributor";

function context() {
  return {
    userId: "hidden-user-id",
    currentSessionId: "hidden-session-id",
    generatedAt: new Date("2026-08-23T12:00:00.000Z"),
    transaction: {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "hidden-user-id" }) },
    } as unknown as Prisma.TransactionClient,
    signal: new AbortController().signal,
  };
}

function requireIncluded(result: Awaited<ReturnType<ReturnType<typeof createFixtureProductContributor>["contribute"]>>) {
  if (result.status !== "included") throw new Error("fixture was not included");
  return result.data;
}

function assertMaterialProjection(data: unknown) {
  const serialized = canonicalJsonStringify(data);
  for (const entry of fixtureJournalEntries) {
    if (!serialized.includes(entry.title) || !serialized.includes(entry.body)) {
      throw new Error("material fixture data was omitted");
    }
  }
}

describe("personal data export product projection audit", () => {
  it("classifies and projects all attributable material data deterministically", async () => {
    const contributor = createFixtureProductContributor();
    const data = requireIncluded(await contributor.contribute(context()));
    const serialized = canonicalJsonStringify(data);

    expect(fixtureProductDeclaration.classifications).toEqual([
      "user_provided",
      "observed",
      "derived",
    ]);
    expect(() => assertMaterialProjection(data)).not.toThrow();
    expect(serialized.indexOf("First note")).toBeLessThan(
      serialized.indexOf("Second note"),
    );
    expect(serialized).toContain("unicode_code_points");
    for (const forbidden of [
      "hidden-entry",
      "hidden-user-id",
      "normalizedTitle",
      "first note",
      "globally shared editor prompt",
      "sessionToken",
      "providerAccountId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps an empty result included and an expected condition unavailable", async () => {
    await expect(
      createFixtureProductContributor({ mode: "empty" }).contribute(context()),
    ).resolves.toEqual({ status: "included", data: [] });
    await expect(
      createFixtureProductContributor({ mode: "unavailable" }).contribute(
        context(),
      ),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "feature_disabled",
    });
  });

  it("detects an attributable material omission", async () => {
    const data = requireIncluded(
      await createFixtureProductContributor({
        mode: "omits_material_data",
      }).contribute(context()),
    );
    expect(() => assertMaterialProjection(data)).toThrow(/material/u);
  });

  it("detects intentionally unstable array ordering", async () => {
    const contributor = createFixtureProductContributor({
      mode: "nondeterministic",
    });
    const first = canonicalJsonStringify(
      requireIncluded(await contributor.contribute(context())),
    );
    const second = canonicalJsonStringify(
      requireIncluded(await contributor.contribute(context())),
    );
    expect(second).not.toBe(first);
  });

  it("rejects a non-JSON fixture result", async () => {
    const data = requireIncluded(
      await createFixtureProductContributor({ mode: "invalid" }).contribute(
        context(),
      ),
    );
    expect(() => canonicalJsonStringify(data)).toThrow();
  });
});