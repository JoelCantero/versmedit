import "server-only";

import type {
  PersonalDataContribution,
  PersonalDataExportContributor,
  PersonalDataExportReadContext,
  PersonalDataModuleDeclaration,
} from "@/modules/account/data-export/types";

export const accountDataExportDeclaration: PersonalDataModuleDeclaration = Object.freeze({
  namespace: "account",
  schemaVersion: 1,
  classifications: Object.freeze(["user_provided", "observed"] as const),
  unavailableReasons: Object.freeze([] as const),
});

function compareLinkedProviders(
  left: { provider: string; type: string },
  right: { provider: string; type: string },
) {
  if (left.provider !== right.provider) {
    return left.provider < right.provider ? -1 : 1;
  }
  return left.type < right.type ? -1 : left.type > right.type ? 1 : 0;
}

export const accountDataExportContributor: PersonalDataExportContributor = Object.freeze({
  namespace: accountDataExportDeclaration.namespace,
  schemaVersion: accountDataExportDeclaration.schemaVersion,
  async contribute(
    context: PersonalDataExportReadContext,
  ): Promise<PersonalDataContribution> {
    context.signal.throwIfAborted();
    const account = await context.transaction.user.findUnique({
      where: { id: context.userId },
      select: {
        name: true,
        email: true,
        image: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        accounts: {
          select: { provider: true, type: true },
        },
      },
    });
    context.signal.throwIfAborted();
    if (!account) throw new Error("Personal data account projection unavailable");

    return {
      status: "included",
      data: {
        userProvided: {
          name: account.name,
          email: account.email,
          image: account.image,
        },
        observed: {
          status: account.status,
          emailVerifiedAt: account.emailVerified?.toISOString() ?? null,
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
          linkedProviders: account.accounts
            .map(({ provider, type }) => ({ provider, type }))
            .sort(compareLinkedProviders),
        },
      },
    };
  },
});