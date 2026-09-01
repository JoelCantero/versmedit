import { describe, expect, it } from "vitest";

import {
  LOGIN_CODE_ALPHABET,
  LOGIN_CODE_LENGTH,
  isLoginCode,
  normalizeLoginCode,
} from "@/modules/login/code";
import {
  generateLoginCode,
  hashLoginCode,
  loginCodeHashesMatch,
} from "@/modules/login/code-token";

const SECRET = "test-auth-secret-value-000000000000";

describe("login code alphabet", () => {
  it("excludes the visually ambiguous characters", () => {
    expect(LOGIN_CODE_ALPHABET).toHaveLength(32);
    for (const excluded of ["I", "L", "O", "U"]) {
      expect(LOGIN_CODE_ALPHABET).not.toContain(excluded);
    }
  });

  it("generates ten characters drawn only from the alphabet", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateLoginCode();
      expect(code).toHaveLength(LOGIN_CODE_LENGTH);
      for (const character of code) {
        expect(LOGIN_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it("uses every position of the alphabet across many draws", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      for (const character of generateLoginCode()) seen.add(character);
    }
    expect(seen.size).toBe(LOGIN_CODE_ALPHABET.length);
  });

  it("does not repeat itself", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateLoginCode()),
    );
    expect(codes.size).toBe(500);
  });
});

describe("normalizeLoginCode", () => {
  it.each([
    ["  7k2qm9xptr  ", "7K2QM9XPTR"],
    ["7K2QM-9XPTR", "7K2QM9XPTR"],
    ["7K2QM 9XPTR", "7K2QM9XPTR"],
    ["7K2QM\n9XPTR", "7K2QM9XPTR"],
    ["7k2qm - 9xptr", "7K2QM9XPTR"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeLoginCode(input)).toBe(expected);
  });

  it("never maps a character onto a different permitted character", () => {
    expect(normalizeLoginCode("IIIIIIIIII")).toBe("IIIIIIIIII");
    expect(isLoginCode(normalizeLoginCode("IIIIIIIIII"))).toBe(false);
    expect(normalizeLoginCode("OOOOOOOOOO")).toBe("OOOOOOOOOO");
    expect(isLoginCode(normalizeLoginCode("OOOOOOOOOO"))).toBe(false);
  });
});

describe("isLoginCode", () => {
  it("accepts a generated code", () => {
    expect(isLoginCode(generateLoginCode())).toBe(true);
  });

  it.each([
    ["7K2QM9XPT", "one character short"],
    ["7K2QM9XPTRA", "one character long"],
    ["7K2QM9XPTI", "excluded letter I"],
    ["7K2QM9XPTL", "excluded letter L"],
    ["7K2QM9XPTO", "excluded letter O"],
    ["7K2QM9XPTU", "excluded letter U"],
    ["7k2qm9xptr", "lower case"],
    ["7K2QM9XPT!", "punctuation"],
    ["", "empty"],
  ])("rejects %j (%s)", (candidate) => {
    expect(isLoginCode(candidate)).toBe(false);
  });
});

describe("hashLoginCode", () => {
  it("is stable for the same address and code", () => {
    const first = hashLoginCode({
      identifier: "person@example.test",
      code: "7K2QM9XPTR",
      secret: SECRET,
    });
    const second = hashLoginCode({
      identifier: "person@example.test",
      code: "7K2QM9XPTR",
      secret: SECRET,
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("normalizes the address before hashing", () => {
    expect(
      hashLoginCode({
        identifier: "  Person@Example.TEST ",
        code: "7K2QM9XPTR",
        secret: SECRET,
      }),
    ).toBe(
      hashLoginCode({
        identifier: "person@example.test",
        code: "7K2QM9XPTR",
        secret: SECRET,
      }),
    );
  });

  it("binds the code to one address", () => {
    expect(
      hashLoginCode({
        identifier: "one@example.test",
        code: "7K2QM9XPTR",
        secret: SECRET,
      }),
    ).not.toBe(
      hashLoginCode({
        identifier: "two@example.test",
        code: "7K2QM9XPTR",
        secret: SECRET,
      }),
    );
  });

  it("depends on the secret", () => {
    expect(
      hashLoginCode({
        identifier: "person@example.test",
        code: "7K2QM9XPTR",
        secret: SECRET,
      }),
    ).not.toBe(
      hashLoginCode({
        identifier: "person@example.test",
        code: "7K2QM9XPTR",
        secret: `${SECRET}-other`,
      }),
    );
  });
});

describe("loginCodeHashesMatch", () => {
  it("matches identical digests and rejects anything else", () => {
    const digest = hashLoginCode({
      identifier: "person@example.test",
      code: "7K2QM9XPTR",
      secret: SECRET,
    });
    expect(loginCodeHashesMatch(digest, digest)).toBe(true);
    expect(loginCodeHashesMatch(digest, `${digest}0`)).toBe(false);
    expect(loginCodeHashesMatch(digest, digest.replace(/^./u, "0"))).toBe(false);
    expect(loginCodeHashesMatch(digest, "")).toBe(false);
  });
});
