import "server-only";

import type {
  PersonalDataContribution,
  PersonalDataExportContributor,
  PersonalDataExportReadContext,
  PersonalDataModuleDeclaration,
} from "@/modules/account/data-export/internal-types";

export const policyAcceptancesDataExportDeclaration: PersonalDataModuleDeclaration = Object.freeze({
  namespace: "policyAcceptances",
  schemaVersion: 1,
  classifications: Object.freeze(["observed"] as const),
  unavailableReasons: Object.freeze([] as const),
});

export const policyAcceptancesDataExportContributor: PersonalDataExportContributor = Object.freeze({
  namespace: policyAcceptancesDataExportDeclaration.namespace,
  schemaVersion: policyAcceptancesDataExportDeclaration.schemaVersion,
  async contribute(
    context: PersonalDataExportReadContext,
  ): Promise<PersonalDataContribution> {
    context.signal.throwIfAborted();
    const acceptance = await context.transaction.policyAcceptance.findUnique({
      where: { userId: context.userId },
      select: {
        termsVersion: true,
        privacyVersion: true,
        acceptedAt: true,
      },
    });
    context.signal.throwIfAborted();

    return {
      status: "included",
      data: acceptance
        ? {
            observed: {
              termsVersion: acceptance.termsVersion,
              privacyVersion: acceptance.privacyVersion,
              acceptedAt: acceptance.acceptedAt.toISOString(),
            },
          }
        : {},
    };
  },
});