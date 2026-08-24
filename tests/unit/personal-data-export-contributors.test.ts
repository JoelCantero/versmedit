// @vitest-environment node

import type { Prisma } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  accountDataExportContributor,
  accountDataExportDeclaration,
} from "@/modules/account/data-export/contributors/account";
import {
  activeSessionsDataExportContributor,
  activeSessionsDataExportDeclaration,
} from "@/modules/account/data-export/contributors/active-sessions";
import {
  policyAcceptancesDataExportContributor,
  policyAcceptancesDataExportDeclaration,
} from "@/modules/account/data-export/contributors/policy-acceptances";

const generatedAt = new Date("2026-08-23T12:00:00.000Z");

function context(transaction: unknown) {
  return {
    userId: "hidden-user-id",
    currentSessionId: "hidden-current-session-id",
    generatedAt,
    transaction: transaction as Prisma.TransactionClient,
    signal: new AbortController().signal,
  };
}

describe("built-in personal data export contributors", () => {
  it("projects account profile and linked identity allowlists", async () => {
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "hidden-user-id",
          name: "Ada Lovelace",
          email: "ada@example.test",
          normalizedEmail: "ada@example.test",
          emailVerified: new Date("2026-08-20T10:00:00.000Z"),
          image: "https://example.test/ada.png",
          status: "ACTIVE",
          createdAt: new Date("2026-08-19T10:00:00.000Z"),
          updatedAt: new Date("2026-08-22T10:00:00.000Z"),
          accounts: [
            {
              id: "hidden-account-z",
              provider: "zeta",
              type: "oauth",
              providerAccountId: "hidden-provider-z",
              access_token: "forbidden-access",
            },
            {
              id: "hidden-account-a",
              provider: "alpha",
              type: "email",
              providerAccountId: "hidden-provider-a",
              refresh_token: "forbidden-refresh",
            },
          ],
        }),
      },
    };

    await expect(
      accountDataExportContributor.contribute(context(transaction)),
    ).resolves.toEqual({
      status: "included",
      data: {
        userProvided: {
          name: "Ada Lovelace",
          email: "ada@example.test",
          image: "https://example.test/ada.png",
        },
        observed: {
          status: "ACTIVE",
          emailVerifiedAt: "2026-08-20T10:00:00.000Z",
          createdAt: "2026-08-19T10:00:00.000Z",
          updatedAt: "2026-08-22T10:00:00.000Z",
          linkedProviders: [
            { provider: "alpha", type: "email" },
            { provider: "zeta", type: "oauth" },
          ],
        },
      },
    });
    expect(accountDataExportDeclaration).toMatchObject({
      namespace: "account",
      schemaVersion: 1,
      classifications: ["user_provided", "observed"],
    });
  });

  it("projects active session timestamps and derived evidence without selectors", async () => {
    const transaction = {
      session: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "hidden-other-session",
            sessionToken: "forbidden-other-token",
            createdAt: null,
            expires: new Date("2026-08-24T12:00:00.000Z"),
            authenticatedAt: new Date("2026-08-23T11:00:00.000Z"),
          },
          {
            id: "hidden-current-session-id",
            sessionToken: "forbidden-current-token",
            createdAt: new Date("2026-08-23T10:00:00.000Z"),
            expires: new Date("2026-08-24T10:00:00.000Z"),
            authenticatedAt: new Date("2026-08-23T11:55:00.000Z"),
          },
        ]),
      },
    };

    const result = await activeSessionsDataExportContributor.contribute(
      context(transaction),
    );
    expect(result).toEqual({
      status: "included",
      data: [
        {
          observed: {
            createdAt: "2026-08-23T10:00:00.000Z",
            expiresAt: "2026-08-24T10:00:00.000Z",
            authenticatedAt: "2026-08-23T11:55:00.000Z",
          },
          derived: { current: true, recentlyAuthenticated: true },
        },
        {
          observed: {
            createdAt: null,
            expiresAt: "2026-08-24T12:00:00.000Z",
            authenticatedAt: "2026-08-23T11:00:00.000Z",
          },
          derived: { current: false, recentlyAuthenticated: false },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /hidden|sessionToken|userId|ip|device|location/iu,
    );
    expect(activeSessionsDataExportDeclaration.classifications).toEqual([
      "observed",
      "derived",
    ]);
  });

  it("projects an acceptance or an explicit included empty object", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({
      id: "hidden-acceptance-id",
      userId: "hidden-user-id",
      termsVersion: "terms-v1",
      privacyVersion: "privacy-v1",
      acceptedAt: new Date("2026-08-20T12:00:00.000Z"),
      createdAt: new Date("2026-08-20T12:00:00.000Z"),
    });
    const transaction = { policyAcceptance: { findUnique } };

    await expect(
      policyAcceptancesDataExportContributor.contribute(context(transaction)),
    ).resolves.toEqual({
      status: "included",
      data: {
        observed: {
          termsVersion: "terms-v1",
          privacyVersion: "privacy-v1",
          acceptedAt: "2026-08-20T12:00:00.000Z",
        },
      },
    });
    findUnique.mockResolvedValueOnce(null);
    await expect(
      policyAcceptancesDataExportContributor.contribute(context(transaction)),
    ).resolves.toEqual({ status: "included", data: {} });
    expect(policyAcceptancesDataExportDeclaration.namespace).toBe(
      "policyAcceptances",
    );
  });
});