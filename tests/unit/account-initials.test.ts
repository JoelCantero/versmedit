import { describe, expect, it } from "vitest";

import { getProfileInitials } from "@/modules/account/initials";

describe("getProfileInitials", () => {
  it("uses one-word names", () => {
    expect(getProfileInitials({ name: "marta", email: "marta@example.test" })).toBe("M");
  });

  it("uses first and last initials for multi-word names", () => {
    expect(getProfileInitials({ name: "marta pla soler", email: "marta@example.test" })).toBe(
      "MS",
    );
  });

  it("falls back to email when name is null", () => {
    expect(getProfileInitials({ name: null, email: "profile@example.test" })).toBe("P");
  });

  it("supports Unicode names", () => {
    expect(getProfileInitials({ name: "Àlex Puig", email: "alex@example.test" })).toBe("ÀP");
  });

  it("handles unusable names and emails", () => {
    expect(getProfileInitials({ name: "   ", email: "---" })).toBe("?");
  });
});