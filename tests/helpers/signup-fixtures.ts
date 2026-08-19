import { randomBytes, randomUUID } from "node:crypto";

import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from "@/modules/signup/policy";

type DatabaseClient = typeof import("@/lib/db").db;
type FixtureLocale = "en" | "es" | "ca";
type FixtureUserStatus = "PENDING" | "ACTIVE";

const WINDOW_MS = 15 * 60_000;

export function createSignupFixtureScope(label = "signup") {
  const scopeId = `${label}-${randomUUID()}`;
  const userIds = new Set<string>();
  const tokenIdentifiers = new Set<string>();
  const limiterKeys = new Set<string>();
  let sequence = 0;

  function nextValue(kind: string) {
    sequence += 1;
    return `${scopeId}-${kind}-${sequence}`;
  }

  function account(overrides: {
    id?: string;
    email?: string;
    name?: string | null;
    status?: FixtureUserStatus;
    emailVerified?: Date | null;
  } = {}) {
    const id = overrides.id ?? `user_${randomUUID()}`;
    const email = overrides.email ?? `${nextValue("user")}@example.test`;
    const status = overrides.status ?? "PENDING";
    const data = {
      id,
      email,
      normalizedEmail: email.trim().toLowerCase(),
      name: overrides.name ?? (status === "ACTIVE" ? "Active Fixture" : null),
      status,
      emailVerified:
        overrides.emailVerified ?? (status === "ACTIVE" ? new Date() : null),
    } as const;

    userIds.add(id);
    return data;
  }

  function signupToken(
    signupAccount: ReturnType<typeof account>,
    overrides: {
      identifier?: string;
      token?: string;
      proposedName?: string;
      locale?: FixtureLocale;
      termsVersion?: string;
      privacyVersion?: string;
      acceptedAt?: Date;
      deliveredAt?: Date | null;
      createdAt?: Date;
      expires?: Date;
    } = {},
  ) {
    const createdAt = overrides.createdAt ?? new Date();
    const identifier = overrides.identifier ?? signupAccount.normalizedEmail;
    const data = {
      identifier,
      token: overrides.token ?? randomBytes(32).toString("hex"),
      expires: overrides.expires ?? new Date(createdAt.getTime() + WINDOW_MS),
      purpose: "SIGNUP" as const,
      proposedName: overrides.proposedName ?? "Signup Fixture",
      locale: overrides.locale ?? "en",
      termsVersion: overrides.termsVersion ?? TERMS_VERSION,
      privacyVersion: overrides.privacyVersion ?? PRIVACY_NOTICE_VERSION,
      acceptedAt: overrides.acceptedAt ?? createdAt,
      deliveredAt: overrides.deliveredAt === undefined ? createdAt : overrides.deliveredAt,
      createdAt,
    };

    userIds.add(signupAccount.id);
    tokenIdentifiers.add(identifier);
    return data;
  }

  function session(
    signupAccount: ReturnType<typeof account>,
    overrides: {
      id?: string;
      sessionToken?: string;
      expires?: Date;
    } = {},
  ) {
    userIds.add(signupAccount.id);
    return {
      id: overrides.id ?? `session_${randomUUID()}`,
      sessionToken: overrides.sessionToken ?? randomUUID(),
      userId: signupAccount.id,
      expires: overrides.expires ?? new Date(Date.now() + 24 * 60 * 60_000),
    };
  }

  function acceptance(
    signupAccount: ReturnType<typeof account>,
    tokenSnapshot: ReturnType<typeof signupToken>,
    overrides: { id?: string; createdAt?: Date } = {},
  ) {
    userIds.add(signupAccount.id);
    return {
      id: overrides.id ?? `acceptance_${randomUUID()}`,
      userId: signupAccount.id,
      termsVersion: tokenSnapshot.termsVersion,
      privacyVersion: tokenSnapshot.privacyVersion,
      acceptedAt: tokenSnapshot.acceptedAt,
      createdAt: overrides.createdAt ?? new Date(),
    };
  }

  function limiter(
    dimension: "client" | "address",
    overrides: { count?: number; resetAt?: Date } = {},
  ) {
    const key = `auth:email:${dimension}:${nextValue("limit")}`;
    limiterKeys.add(key);
    return {
      key,
      count: overrides.count ?? 1,
      resetAt: overrides.resetAt ?? new Date(Date.now() + WINDOW_MS),
    };
  }

  async function cleanup(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    const trackedUserIds = [...userIds];
    const trackedIdentifiers = [...tokenIdentifiers];
    const trackedLimiterKeys = [...limiterKeys];

    await client.$transaction(async (transaction) => {
      if (trackedUserIds.length > 0) {
        await transaction.session.deleteMany({
          where: { userId: { in: trackedUserIds } },
        });
        await transaction.account.deleteMany({
          where: { userId: { in: trackedUserIds } },
        });
        await transaction.$executeRawUnsafe(
          'DELETE FROM "PolicyAcceptance" WHERE "userId" = ANY($1::text[])',
          trackedUserIds,
        );
      }
      if (trackedIdentifiers.length > 0) {
        await transaction.verificationToken.deleteMany({
          where: { identifier: { in: trackedIdentifiers } },
        });
      }
      if (trackedLimiterKeys.length > 0) {
        await transaction.rateLimitBucket.deleteMany({
          where: { key: { in: trackedLimiterKeys } },
        });
      }
      if (trackedUserIds.length > 0) {
        await transaction.user.deleteMany({
          where: { id: { in: trackedUserIds } },
        });
      }
    });

    userIds.clear();
    tokenIdentifiers.clear();
    limiterKeys.clear();
  }

  return {
    scopeId,
    account,
    signupToken,
    session,
    acceptance,
    limiter,
    cleanup,
  };
}