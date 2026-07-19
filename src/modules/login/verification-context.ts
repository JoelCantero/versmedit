import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export interface PublishedVerificationToken {
  identifier: string;
  token: string;
}

interface VerificationStore {
  publication: Promise<PublishedVerificationToken>;
  publish: (token: PublishedVerificationToken) => void;
}

const verificationStorage = new AsyncLocalStorage<VerificationStore>();

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