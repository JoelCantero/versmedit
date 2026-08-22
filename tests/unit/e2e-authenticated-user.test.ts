// @vitest-environment node

import { isIP } from "node:net";
import type { BrowserContext } from "@playwright/test";

import { describe, expect, it, vi } from "vitest";

import { installAuthSessionCookie } from "../e2e/helpers/authenticated-user";

describe("authenticated E2E browser isolation", () => {
  it("assigns a deterministic valid client address per session token", async () => {
    const setExtraHTTPHeaders = vi
      .fn<(headers: Record<string, string>) => Promise<void>>()
      .mockResolvedValue(undefined);
    const addCookies = vi
      .fn<BrowserContext["addCookies"]>()
      .mockResolvedValue(undefined);
    const context = {
      setExtraHTTPHeaders,
      addCookies,
    } as unknown as BrowserContext;

    await installAuthSessionCookie(context, "session-token-a", "http://localhost:3100");
    await installAuthSessionCookie(context, "session-token-a", "http://localhost:3100");
    await installAuthSessionCookie(context, "session-token-b", "http://localhost:3100");

    const addresses = setExtraHTTPHeaders.mock.calls.map(
      ([headers]) => headers["cf-connecting-ip"],
    );
    expect(addresses.every((address) => isIP(address) === 6)).toBe(true);
    expect(addresses[0]).toBe(addresses[1]);
    expect(addresses[0]).not.toBe(addresses[2]);
    expect(addCookies).toHaveBeenCalledTimes(3);
  });
});