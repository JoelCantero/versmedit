import { describe, expect, it, vi } from "vitest";

import {
  accountDeletionCommandSchema,
  accountDeletionReauthenticationSchema,
  createPendingDeletionSignal,
  getAccountDeletionCompletionPath,
  getAccountDeletionIntentPath,
  parseAccountDeletionLocale,
  parsePendingDeletionSignal,
  recoverPendingDeletion,
} from "@/modules/account/deletion/schema";

describe("account deletion input contracts", () => {
  it.each(["en", "es", "ca"] as const)("accepts the supported locale %s", (locale) => {
    expect(parseAccountDeletionLocale(locale)).toBe(locale);
  });

  it.each(["", "fr", "EN", null, 1])("rejects unsupported locale %j", (locale) => {
    expect(() => parseAccountDeletionLocale(locale)).toThrow();
  });

  it("accepts only the exact reauthentication body", () => {
    expect(
      accountDeletionReauthenticationSchema.parse({ csrfToken: "csrf", locale: "es" }),
    ).toEqual({ csrfToken: "csrf", locale: "es" });

    for (const body of [
      { locale: "es" },
      { csrfToken: "", locale: "es" },
      { csrfToken: "csrf", locale: "fr" },
      { csrfToken: "csrf", locale: "es", email: "other@example.test" },
      { csrfToken: "csrf", locale: "es", userId: "other" },
    ]) {
      expect(accountDeletionReauthenticationSchema.safeParse(body).success).toBe(false);
    }
  });

  it("accepts only the fixed final-deletion command", () => {
    expect(
      accountDeletionCommandSchema.parse({
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "permanently_delete",
      }),
    ).toEqual({
      csrfToken: "csrf",
      locale: "ca",
      confirmation: "permanently_delete",
    });

    for (const body of [
      { csrfToken: "csrf", locale: "ca" },
      { csrfToken: "csrf", locale: "ca", confirmation: "delete" },
      {
        csrfToken: "csrf",
        locale: "ca",
        confirmation: "permanently_delete",
        sessionToken: "forged",
      },
    ]) {
      expect(accountDeletionCommandSchema.safeParse(body).success).toBe(false);
    }
  });

  it.each([
    ["en", "/account/data?intent=delete", "/account-deleted"],
    ["es", "/es/account/data?intent=delete", "/es/account-deleted"],
    ["ca", "/ca/account/data?intent=delete", "/ca/account-deleted"],
  ] as const)("builds fixed identity-free %s paths", (locale, intentPath, completionPath) => {
    expect(getAccountDeletionIntentPath(locale)).toBe(intentPath);
    expect(getAccountDeletionCompletionPath(locale)).toBe(completionPath);
  });
});

describe("pending account deletion signal", () => {
  it("contains only locale and an expiry no more than ten minutes ahead", () => {
    const now = 1_800_000_000_000;
    const signal = createPendingDeletionSignal("es", now);

    expect(signal).toEqual({ locale: "es", expiresAt: now + 10 * 60_000 });
    expect(Object.keys(signal).sort()).toEqual(["expiresAt", "locale"]);
    expect(parsePendingDeletionSignal(JSON.stringify(signal), now)).toEqual(signal);
  });

  it.each([
    null,
    "",
    "not-json",
    JSON.stringify({ locale: "en", expiresAt: 1_800_000_000_000 }),
    JSON.stringify({ locale: "fr", expiresAt: 1_800_000_000_100 }),
    JSON.stringify({ locale: "en", expiresAt: 1_800_000_600_001 }),
    JSON.stringify({ locale: "en", expiresAt: 1_800_000_000_100, userId: "private" }),
  ])("rejects malformed, expired, overlong, or identifying signal %j", (value) => {
    expect(parsePendingDeletionSignal(value, 1_800_000_000_000)).toBeNull();
  });

  it("checks session once, clears the signal, and never invokes a mutation", async () => {
    const now = 1_800_000_000_000;
    let value: string | null = JSON.stringify(createPendingDeletionSignal("ca", now));
    const storage = {
      getItem: vi.fn(() => value),
      removeItem: vi.fn(() => {
        value = null;
      }),
    };
    const checkSession = vi.fn().mockResolvedValue(false);

    await expect(
      recoverPendingDeletion({ storage, checkSession, now }),
    ).resolves.toEqual({ status: "completed", redirectTo: "/ca/account-deleted" });
    expect(checkSession).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledOnce();
  });

  it("does not infer success while the former session still authorizes", async () => {
    const now = 1_800_000_000_000;
    let value: string | null = JSON.stringify(createPendingDeletionSignal("en", now));
    const storage = {
      getItem() {
        return value;
      },
      removeItem() {
        value = null;
      },
    };

    await expect(
      recoverPendingDeletion({
        storage,
        checkSession: vi.fn().mockResolvedValue(true),
        now,
      }),
    ).resolves.toEqual({ status: "retry" });
    expect(value).toBeNull();
  });

  it("keeps the pending signal when session authorization cannot be determined", async () => {
    const now = 1_800_000_000_000;
    const value = JSON.stringify(createPendingDeletionSignal("en", now));
    const storage = {
      getItem: vi.fn(() => value),
      removeItem: vi.fn(),
    };

    await expect(
      recoverPendingDeletion({
        storage,
        checkSession: vi.fn().mockRejectedValue(new Error("session unavailable")),
        now,
      }),
    ).resolves.toEqual({ status: "pending" });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});