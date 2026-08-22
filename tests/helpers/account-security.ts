import { createHash } from "node:crypto";

import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from "@/modules/signup/policy";

type DatabaseClient = typeof import("@/lib/db").db;
type FixtureLocale = "en" | "es" | "ca";
type VerificationPurpose =
  | "LOGIN"
  | "SIGNUP"
  | "ACCOUNT_DELETION"
  | "ACCOUNT_SECURITY";

const DAY_MS = 24 * 60 * 60_000;
const WINDOW_MS = 15 * 60_000;
let fixtureScopeSequence = 0;

export function createAccountSecurityFixtureScope({
  label = "account-security",
  now = new Date("2026-08-22T12:00:00.000Z"),
}: {
  label?: string;
  now?: Date;
} = {}) {
  fixtureScopeSequence += 1;
  const scopeId = `${label}-${String(fixtureScopeSequence).padStart(2, "0")}`;
  const userIds = new Set<string>();
  const tokenIdentifiers = new Set<string>();
  const limiterKeys = new Set<string>();
  let recordSequence = 0;

  function nextId(kind: string) {
    recordSequence += 1;
    return `${scopeId}-${kind}-${String(recordSequence).padStart(2, "0")}`;
  }

  function account(overrides: {
    id?: string;
    email?: string;
    name?: string | null;
  } = {}) {
    const id = overrides.id ?? nextId("user");
    const email = overrides.email ?? `${id}@example.test`;
    userIds.add(id);
    return {
      id,
      email,
      normalizedEmail: email.trim().toLowerCase(),
      name: overrides.name ?? "Account Security Fixture",
      status: "ACTIVE" as const,
      emailVerified: new Date(now),
    };
  }

  function session(
    owner: ReturnType<typeof account>,
    overrides: {
      id?: string;
      sessionToken?: string;
      expires?: Date;
      createdAt?: Date | null;
      authenticatedAt?: Date | null;
    } = {},
  ) {
    userIds.add(owner.id);
    const id = overrides.id ?? nextId("session");
    return {
      id,
      sessionToken: overrides.sessionToken ?? `${id}-token`,
      userId: owner.id,
      expires: overrides.expires ?? new Date(now.getTime() + DAY_MS),
      createdAt:
        overrides.createdAt === undefined ? new Date(now) : overrides.createdAt,
      authenticatedAt:
        overrides.authenticatedAt === undefined
          ? new Date(now)
          : overrides.authenticatedAt,
    };
  }

  function currentSession(
    owner: ReturnType<typeof account>,
    overrides: Parameters<typeof session>[1] = {},
  ) {
    return session(owner, {
      id: `${scopeId}-current`,
      sessionToken: `${scopeId}-current-token`,
      ...overrides,
    });
  }

  function activeSession(
    owner: ReturnType<typeof account>,
    overrides: Parameters<typeof session>[1] = {},
  ) {
    return session(owner, {
      createdAt: new Date(now.getTime() - 5 * 60_000),
      authenticatedAt: new Date(now.getTime() - 5 * 60_000),
      ...overrides,
    });
  }

  function expiredSession(
    owner: ReturnType<typeof account>,
    overrides: Parameters<typeof session>[1] = {},
  ) {
    return session(owner, {
      expires: new Date(now.getTime() - 1),
      createdAt: new Date(now.getTime() - DAY_MS),
      authenticatedAt: new Date(now.getTime() - DAY_MS),
      ...overrides,
    });
  }

  function legacyNullSession(
    owner: ReturnType<typeof account>,
    overrides: Parameters<typeof session>[1] = {},
  ) {
    return session(owner, {
      createdAt: null,
      authenticatedAt: null,
      ...overrides,
    });
  }

  function equalTimeSessions(
    owner: ReturnType<typeof account>,
    count = 2,
    timestamp = new Date(now.getTime() - 10 * 60_000),
  ) {
    return Array.from({ length: count }, (_, index) =>
      session(owner, {
        id: `${scopeId}-equal-${String(index + 1).padStart(2, "0")}`,
        sessionToken: `${scopeId}-equal-token-${String(index + 1).padStart(2, "0")}`,
        createdAt: new Date(timestamp),
        authenticatedAt: new Date(timestamp),
      }),
    );
  }

  function overCapSessions(owner: ReturnType<typeof account>, count = 21) {
    if (!Number.isInteger(count) || count < 21) {
      throw new RangeError("over-cap fixture requires at least 21 sessions");
    }
    return Array.from({ length: count }, (_, index) => {
      const ordinal = String(index + 1).padStart(2, "0");
      const createdAt = new Date(now.getTime() - (count - index) * 60_000);
      return session(owner, {
        id: `${scopeId}-over-cap-${ordinal}`,
        sessionToken: `${scopeId}-over-cap-token-${ordinal}`,
        createdAt,
        authenticatedAt: new Date(createdAt),
      });
    });
  }

  function verificationToken(
    owner: ReturnType<typeof account>,
    purpose: VerificationPurpose = "ACCOUNT_SECURITY",
    overrides: {
      token?: string;
      locale?: FixtureLocale;
      deliveredAt?: Date | null;
      expires?: Date;
    } = {},
  ) {
    tokenIdentifiers.add(owner.normalizedEmail);
    const issuedAt = new Date(now);
    const localizedNonSignup =
      purpose === "ACCOUNT_DELETION" || purpose === "ACCOUNT_SECURITY"
        ? {
            locale: overrides.locale ?? "en",
            deliveredAt:
              overrides.deliveredAt === undefined
                ? issuedAt
                : overrides.deliveredAt,
          }
        : {};
    const signupSnapshot =
      purpose === "SIGNUP"
        ? {
            proposedName: owner.name ?? "Account Security Fixture",
            locale: overrides.locale ?? "en",
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_NOTICE_VERSION,
            acceptedAt: issuedAt,
            deliveredAt:
              overrides.deliveredAt === undefined
                ? issuedAt
                : overrides.deliveredAt,
          }
        : {};

    return {
      identifier: owner.normalizedEmail,
      token: overrides.token ?? nextId("verification-token"),
      expires: overrides.expires ?? new Date(now.getTime() + WINDOW_MS),
      purpose,
      createdAt: issuedAt,
      ...localizedNonSignup,
      ...signupSnapshot,
    };
  }

  function addressBucket(owner: ReturnType<typeof account>) {
    const key = `auth:email:address:${createHash("sha256")
      .update(owner.normalizedEmail)
      .digest("hex")}`;
    limiterKeys.add(key);
    return { key, count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) };
  }

  function securityClientBucket(clientIdentifier = `${scopeId}-client`) {
    const key = `account:security:reauth:client:${clientIdentifier}`;
    limiterKeys.add(key);
    return { key, count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) };
  }

  async function seedFullGraph(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    const owner = account();
    const sessions = {
      current: currentSession(owner),
      active: activeSession(owner),
      expired: expiredSession(owner),
      legacyNull: legacyNullSession(owner),
      equalTime: equalTimeSessions(owner),
      overCap: overCapSessions(owner),
    };
    const token = verificationToken(owner);
    const buckets = [addressBucket(owner), securityClientBucket()];

    await client.$transaction(async (transaction) => {
      await transaction.user.create({ data: owner });
      await transaction.session.createMany({
        data: [
          sessions.current,
          sessions.active,
          sessions.expired,
          sessions.legacyNull,
          ...sessions.equalTime,
          ...sessions.overCap,
        ],
      });
      await transaction.verificationToken.create({ data: token });
      await transaction.rateLimitBucket.createMany({ data: buckets });
    });

    return { owner, sessions, token, buckets };
  }

  async function cleanup(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    const trackedUserIds = [...userIds];
    const trackedIdentifiers = [...tokenIdentifiers];
    const trackedLimiterKeys = [...limiterKeys];

    await client.$transaction(async (transaction) => {
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
    now: new Date(now),
    account,
    session,
    currentSession,
    activeSession,
    expiredSession,
    legacyNullSession,
    equalTimeSessions,
    overCapSessions,
    verificationToken,
    addressBucket,
    securityClientBucket,
    seedFullGraph,
    cleanup,
  };
}