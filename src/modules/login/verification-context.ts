import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export interface PublishedVerificationToken {
  identifier: string;
  token: string;
  code: string;
}

interface VerificationStore {
  publication: Promise<PublishedVerificationToken>;
  publish: (token: PublishedVerificationToken) => void;
}

export interface LoginCodeAuthorization {
  identifier: string;
  token: string;
  codeHash: string;
}

const verificationStorage = new AsyncLocalStorage<VerificationStore>();

const loginCodeStorage = new AsyncLocalStorage<LoginCodeAuthorization>();

export function runWithVerificationContext<T>(callback: () => Promise<T>) {
  let publish!: (token: PublishedVerificationToken) => void;
  const publication = new Promise<PublishedVerificationToken>((resolve) => {
    publish = resolve;
  });
  return verificationStorage.run({ publication, publish }, callback);
}

export function publishVerificationToken(token: PublishedVerificationToken) {
  verificationStorage.getStore()?.publish(token);
}

export async function getPublishedVerificationToken(timeoutMs = 2_000) {
  const store = verificationStorage.getStore();
  if (!store) return null;

  return Promise.race([
    store.publication,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export function runWithLoginCodeAuthorization<T>(
  authorization: LoginCodeAuthorization,
  callback: () => Promise<T>,
) {
  return loginCodeStorage.run({ ...authorization }, callback);
}

export function getLoginCodeAuthorization() {
  return loginCodeStorage.getStore() ?? null;
}