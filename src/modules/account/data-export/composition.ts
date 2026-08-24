import "server-only";

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
import { createPersonalDataExportRegistry } from "@/modules/account/data-export/registry";

export const personalDataExportRegistry = createPersonalDataExportRegistry(
  [
    accountDataExportDeclaration,
    activeSessionsDataExportDeclaration,
    policyAcceptancesDataExportDeclaration,
  ],
  [
    accountDataExportContributor,
    activeSessionsDataExportContributor,
    policyAcceptancesDataExportContributor,
  ],
);