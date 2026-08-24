// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createPersonalDataExportRegistry } from "@/modules/account/data-export/registry";

function declaration(namespace: string, schemaVersion = 1) {
  return {
    namespace,
    schemaVersion,
    classifications: ["observed"] as const,
    unavailableReasons: [] as const,
  };
}

function contributor(namespace: string, schemaVersion = 1) {
  return {
    namespace,
    schemaVersion,
    async contribute() {
      return { status: "included" as const, data: {} };
    },
  };
}

describe("createPersonalDataExportRegistry", () => {
  it("sorts one-to-one declarations and contributors without mutating inputs", () => {
    const declarations = [declaration("zeta"), declaration("alpha")];
    const contributors = [contributor("zeta"), contributor("alpha")];

    const registry = createPersonalDataExportRegistry(
      declarations,
      contributors,
    );

    expect(registry.namespaces).toEqual(["alpha", "zeta"]);
    expect(registry.declarations.map(({ namespace }) => namespace)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(registry.contributors.map(({ namespace }) => namespace)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(declarations.map(({ namespace }) => namespace)).toEqual([
      "zeta",
      "alpha",
    ]);
  });

  it("freezes the registry and rejects late mutation", () => {
    const registry = createPersonalDataExportRegistry(
      [declaration("account")],
      [contributor("account")],
    );

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.namespaces)).toBe(true);
    expect(Object.isFrozen(registry.declarations)).toBe(true);
    expect(Object.isFrozen(registry.contributors)).toBe(true);
    expect(Object.isFrozen(registry.declarations[0])).toBe(true);
    expect(Object.isFrozen(registry.declarations[0]?.classifications)).toBe(true);
    expect(Object.isFrozen(registry.contributors[0])).toBe(true);
    expect(() =>
      (registry.namespaces as unknown as string[]).push("late"),
    ).toThrow();
  });

  it.each([
    {
      name: "duplicate declarations",
      declarations: [declaration("account"), declaration("account")],
      contributors: [contributor("account")],
    },
    {
      name: "duplicate contributors",
      declarations: [declaration("account")],
      contributors: [contributor("account"), contributor("account")],
    },
    {
      name: "missing contributor",
      declarations: [declaration("account")],
      contributors: [],
    },
    {
      name: "undeclared contributor",
      declarations: [],
      contributors: [contributor("account")],
    },
  ])("rejects $name", ({ declarations, contributors }) => {
    expect(() =>
      createPersonalDataExportRegistry(declarations, contributors),
    ).toThrow(/personal data export registry/u);
  });

  it.each([
    ["invalid namespace", declaration("Account")],
    ["empty namespace segment", declaration("journal..entries")],
    ["zero version", declaration("journal.entries", 0)],
    ["fractional version", declaration("journal.entries", 1.5)],
    [
      "invalid classification",
      { ...declaration("journal.entries"), classifications: ["secret"] },
    ],
    [
      "invalid unavailable reason",
      { ...declaration("journal.entries"), unavailableReasons: ["Database failure"] },
    ],
  ])("rejects a declaration with %s", (_label, invalidDeclaration) => {
    expect(() =>
      createPersonalDataExportRegistry(
        [invalidDeclaration as ReturnType<typeof declaration>],
        [contributor(invalidDeclaration.namespace, invalidDeclaration.schemaVersion)],
      ),
    ).toThrow(/personal data export registry/u);
  });

  it("rejects a contributor version mismatch", () => {
    expect(() =>
      createPersonalDataExportRegistry(
        [declaration("journal.entries", 2)],
        [contributor("journal.entries", 1)],
      ),
    ).toThrow(/schema version mismatch/u);
  });

  it("preserves sorted execution order and an asynchronous narrow-context call", async () => {
    const seen: unknown[] = [];
    const contribute = vi.fn(async (value: unknown) => {
      seen.push(value);
      return { status: "included" as const, data: {} };
    });
    const registry = createPersonalDataExportRegistry(
      [declaration("zeta"), declaration("alpha")],
      [contributor("zeta"), { ...contributor("alpha"), contribute }],
    );
    const narrowContext = Object.freeze({ marker: "only supplied context" });

    const result = registry.contributors[0]!.contribute(
      narrowContext as never,
    );

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual({ status: "included", data: {} });
    expect(seen).toEqual([narrowContext]);
    expect(registry.contributors.map(({ namespace }) => namespace)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("contains no filesystem, model, or glob auto-discovery", async () => {
    const source = await readFile(
      new URL(
        "../../src/modules/account/data-export/registry.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/node:fs|glob|generated\/prisma|@\/lib\/db/u);
  });
});