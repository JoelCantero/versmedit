import { randomBytes, randomUUID } from "node:crypto";

import { getAuthEmailAddressRateLimitKey } from "@/lib/auth-email-rate-limit";
import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from "@/modules/signup/policy";

type DatabaseClient = typeof import("@/lib/db").db;
type FixtureLocale = "en" | "es" | "ca";

const WINDOW_MS = 15 * 60_000;

export function createAccountDeletionFixtureScope(label = "account-deletion") {
  const scopeId = `${label}-${randomUUID()}`;
  const userIds = new Set<string>();
  const tokenIdentifiers = new Set<string>();
  const limiterKeys = new Set<string>();

  function account(overrides: {
    id?: string;
    email?: string;
    name?: string | null;
  } = {}) {
    const id = overrides.id ?? `user_${randomUUID()}`;
    const email = overrides.email ?? `${scopeId}-${randomUUID()}@example.test`;
    userIds.add(id);
    return {
      id,
      email,
      normalizedEmail: email.trim().toLowerCase(),
      name: overrides.name ?? "Deletion Fixture",
      status: "ACTIVE" as const,
      emailVerified: new Date(),
    };
  }

  function identity(owner: ReturnType<typeof account>) {
    userIds.add(owner.id);
    return {
      id: `account_${randomUUID()}`,
      userId: owner.id,
      type: "oauth",
      provider: "fixture",
      providerAccountId: randomUUID(),
    };
  }

  function session(
    owner: ReturnType<typeof account>,
    overrides: {
      id?: string;
      sessionToken?: string;
      expires?: Date;
      authenticatedAt?: Date | null;
    } = {},
  ) {
    userIds.add(owner.id);
    return {
      id: overrides.id ?? `session_${randomUUID()}`,
      sessionToken: overrides.sessionToken ?? randomUUID(),
      userId: owner.id,
      expires: overrides.expires ?? new Date(Date.now() + 24 * 60 * 60_000),
      authenticatedAt:
        overrides.authenticatedAt === undefined
          ? new Date()
          : overrides.authenticatedAt,
    };
  }

  function policyAcceptance(owner: ReturnType<typeof account>) {
    userIds.add(owner.id);
    return {
      id: `acceptance_${randomUUID()}`,
      userId: owner.id,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_NOTICE_VERSION,
      acceptedAt: new Date(),
    };
  }

  function verificationToken(
    owner: ReturnType<typeof account>,
    purpose: "LOGIN" | "SIGNUP" | "ACCOUNT_DELETION",
    overrides: {
      token?: string;
      locale?: FixtureLocale;
      deliveredAt?: Date | null;
      expires?: Date;
    } = {},
  ) {
    tokenIdentifiers.add(owner.normalizedEmail);
    const now = new Date();
    const signupSnapshot =
      purpose === "SIGNUP"
        ? {
            proposedName: owner.name ?? "Deletion Fixture",
            locale: overrides.locale ?? "en",
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_NOTICE_VERSION,
            acceptedAt: now,
            deliveredAt:
              overrides.deliveredAt === undefined ? now : overrides.deliveredAt,
          }
        : purpose === "ACCOUNT_DELETION"
          ? {
              locale: overrides.locale ?? "en",
              deliveredAt:
                overrides.deliveredAt === undefined ? now : overrides.deliveredAt,
            }
          : {};

    return {
      identifier: owner.normalizedEmail,
      token: overrides.token ?? randomBytes(32).toString("hex"),
      expires: overrides.expires ?? new Date(now.getTime() + WINDOW_MS),
      purpose,
      ...signupSnapshot,
    };
  }

  function addressBucket(owner: ReturnType<typeof account>) {
    const key = getAuthEmailAddressRateLimitKey(owner.normalizedEmail);
    limiterKeys.add(key);
    return { key, count: 1, resetAt: new Date(Date.now() + WINDOW_MS) };
  }

  function clientBucket(
    operation: "reauth" | "final",
    clientIdentifier = `${scopeId}-client`,
  ) {
    const key = `account:deletion:${operation}:client:${clientIdentifier}`;
    limiterKeys.add(key);
    return { key, count: 1, resetAt: new Date(Date.now() + WINDOW_MS) };
  }

  async function seedFullGraph(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    const owner = account();
    const identities = [identity(owner)];
    const sessions = [session(owner), session(owner)];
    const acceptance = policyAcceptance(owner);
    const tokens = [
      verificationToken(owner, "LOGIN"),
      verificationToken(owner, "SIGNUP"),
      verificationToken(owner, "ACCOUNT_DELETION"),
    ];
    const buckets = [addressBucket(owner), clientBucket("reauth"), clientBucket("final")];

    await client.$transaction(async (transaction) => {
      await transaction.user.create({ data: owner });
      await transaction.account.createMany({ data: identities });
      await transaction.session.createMany({ data: sessions });
      await transaction.policyAcceptance.create({ data: acceptance });
      await transaction.verificationToken.createMany({ data: tokens });
      await transaction.rateLimitBucket.createMany({ data: buckets });
    });

    return { owner, identities, sessions, acceptance, tokens, buckets };
  }

  async function cleanup(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    const trackedUserIds = [...userIds];
    const trackedIdentifiers = [...tokenIdentifiers];
    const trackedLimiterKeys = [...limiterKeys];

    await client.$transaction(async (transaction) => {
      await transaction.policyAcceptance.deleteMany({
        where: { userId: { in: trackedUserIds } },
      });
      await transaction.verificationToken.deleteMany({
        where: { identifier: { in: trackedIdentifiers } },
      });
      await transaction.rateLimitBucket.deleteMany({
        where: { key: { in: trackedLimiterKeys } },
      });
      await transaction.user.deleteMany({
        where: { id: { in: trackedUserIds } },
      });
    });

    userIds.clear();
    tokenIdentifiers.clear();
    limiterKeys.clear();
  }

  return {
    scopeId,
    account,
    identity,
    session,
    policyAcceptance,
    verificationToken,
    addressBucket,
    clientBucket,
    seedFullGraph,
    cleanup,
  };
}