import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export interface AccountDeletionVerificationAuthorization {
  identifier: string;
  token: string;
}

const verificationStorage =
  new AsyncLocalStorage<AccountDeletionVerificationAuthorization>();

export function runWithAccountDeletionVerification<T>(
  authorization: AccountDeletionVerificationAuthorization,
  callback: () => T,
) {
  return verificationStorage.run({ ...authorization }, callback);
}

export function getAccountDeletionVerificationAuthorization() {
  return verificationStorage.getStore() ?? null;
}