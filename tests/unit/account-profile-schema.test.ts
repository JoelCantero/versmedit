import { describe, expect, it } from "vitest";

import { parseProfileName } from "@/lib/validation/profile-name";

describe("profile name schema", () => {
  it("requires a non-empty name after trimming surrounding whitespace", () => {
    expect(() => parseProfileName("")).toThrow();
    expect(() => parseProfileName("   ")).toThrow();
  });

  it("trims surrounding whitespace and preserves internal spacing", () => {
    expect(parseProfileName("  Maria del Mar  ")).toBe("Maria del Mar");
  });

  it("accepts names up to 80 characters and rejects longer values", () => {
    const max = "A".repeat(80);
    const tooLong = "A".repeat(81);

    expect(parseProfileName(max)).toBe(max);
    expect(() => parseProfileName(tooLong)).toThrow();
  });

  it.each([
    "Josep",
    "María",
    "Lluís",
    "Joan d'Arc",
    "Joan d’Arc",
    "Anna-Maria",
    "Pau Claris",
  ])("accepts valid Unicode names: %s", (name) => {
    expect(parseProfileName(name)).toBe(name);
  });

  it.each(["Jane3", "Marta!", "Ava🙂", "<script>", "_Name"])(
    "rejects unsupported characters: %s",
    (name) => {
      expect(() => parseProfileName(name)).toThrow();
    },
  );
});