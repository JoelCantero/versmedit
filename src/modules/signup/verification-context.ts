import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export interface SignupActivationAuthorization {
  identifier: string;
  token: string;
}

const activationStorage =
  new AsyncLocalStorage<SignupActivationAuthorization>();

export function runWithSignupActivation<T>(
  authorization: SignupActivationAuthorization,
  callback: () => Promise<T>,
) {
  return activationStorage.run({ ...authorization }, callback);
}

export function getSignupActivationAuthorization() {
  return activationStorage.getStore() ?? null;
}