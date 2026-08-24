import { createHash } from "node:crypto";

import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from "@/modules/signup/policy";

type DatabaseClient = typeof import("@/lib/db").db;
type FixtureLocale = "en" | "es" | "ca";

const DAY_MS = 24 * 60 * 60_000;
const WINDOW_MS = 15 * 60_000;
let fixtureSequence = 0;

export type FixtureJsonValue =
  | null
  | boolean
  | number
  | string
  | FixtureJsonValue[]
  | { [key: string]: FixtureJsonValue };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalizeFixtureValue(value: FixtureJsonValue): FixtureJsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeFixtureValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeFixtureValue(value[key]!)]),
    );
  }
  return value;
}

export function createPersonalDataExportFixtureScope({
  label = "personal-data-export",
  now = new Date("2026-08-23T12:00:00.000Z"),
}: {
  label?: string;
  now?: Date;
} = {}) {
  fixtureSequence += 1;
  const scopeId = `${label}-${String(fixtureSequence).padStart(2, "0")}`;
  const trackedUserIds = new Set<string>();
  const trackedIdentifiers = new Set<string>();
  const trackedLimiterKeys = new Set<string>();
  let recordSequence = 0;

  function nextId(kind: string) {
    recordSequence += 1;
    return `${scopeId}-${kind}-${String(recordSequence).padStart(2, "0")}`;
  }

  function account(overrides: {
    id?: string;
    email?: string;
    name?: string | null;
    image?: string | null;
  } = {}) {
    const id = overrides.id ?? nextId("user");
    const email = overrides.email ?? `${id}@example.test`;
    trackedUserIds.add(id);
    return {
      id,
      email,
      normalizedEmail: email.trim().toLowerCase(),
      name: overrides.name ?? "Personal Data Export Fixture",
      image: overrides.image ?? "https://example.test/avatar.png",
      status: "ACTIVE" as const,
      emailVerified: new Date(now.getTime() - DAY_MS),
      createdAt: new Date(now.getTime() - 2 * DAY_MS),
      updatedAt: new Date(now.getTime() - DAY_MS),
    };
  }

  function identity(
    owner: ReturnType<typeof account>,
    overrides: { provider?: string; type?: string } = {},
  ) {
    trackedUserIds.add(owner.id);
    return {
      id: nextId("account"),
      userId: owner.id,
      type: overrides.type ?? "oauth",
      provider: overrides.provider ?? "fixture",
      providerAccountId: nextId("provider-account"),
      access_token: `${scopeId}-forbidden-access-token`,
      refresh_token: `${scopeId}-forbidden-refresh-token`,
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
    trackedUserIds.add(owner.id);
    const id = overrides.id ?? nextId("session");
    return {
      id,
      sessionToken: overrides.sessionToken ?? `${id}-token`,
      userId: owner.id,
      expires: overrides.expires ?? new Date(now.getTime() + DAY_MS),
      createdAt:
        overrides.createdAt === undefined
          ? new Date(now.getTime() - 30 * 60_000)
          : overrides.createdAt,
      authenticatedAt:
        overrides.authenticatedAt === undefined
          ? new Date(now.getTime() - 5 * 60_000)
          : overrides.authenticatedAt,
    };
  }

  function policyAcceptance(owner: ReturnType<typeof account>) {
    trackedUserIds.add(owner.id);
    return {
      id: nextId("acceptance"),
      userId: owner.id,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_NOTICE_VERSION,
      acceptedAt: new Date(now.getTime() - DAY_MS),
      createdAt: new Date(now.getTime() - DAY_MS),
    };
  }

  function exportCredential(
    owner: ReturnType<typeof account>,
    overrides: {
      locale?: FixtureLocale;
      deliveredAt?: Date | null;
      expires?: Date;
    } = {},
  ) {
    trackedIdentifiers.add(owner.normalizedEmail);
    const raw = createHash("sha256")
      .update(nextId("raw-credential"))
      .digest("base64url");
    return {
      raw,
      identifier: owner.normalizedEmail,
      token: sha256(`fixture-secret:${raw}`),
      expires: overrides.expires ?? new Date(now.getTime() + WINDOW_MS),
      purpose: "ACCOUNT_DATA_EXPORT" as const,
      locale: overrides.locale ?? "en",
      deliveredAt:
        overrides.deliveredAt === undefined
          ? new Date(now)
          : overrides.deliveredAt,
      createdAt: new Date(now),
    };
  }

  function authorization(
    exactSession: ReturnType<typeof session>,
    expiresAt = new Date(now.getTime() + WINDOW_MS),
  ) {
    return {
      sessionId: exactSession.id,
      confirmedAt: new Date(now),
      expiresAt,
    };
  }

  function rateLimitBuckets(
    owner: ReturnType<typeof account>,
    exactSession: ReturnType<typeof session>,
    clientIdentifier = `${scopeId}-client`,
  ) {
    const keys = {
      requestClient: `account:data-export:request:client:${clientIdentifier}`,
      requestAccount: `account:data-export:request:account:${sha256(owner.normalizedEmail)}`,
      confirmationClient: `account:data-export:verify:client:${clientIdentifier}`,
      generationSession: `account:data-export:generate:session:${sha256(exactSession.id)}`,
    };
    Object.values(keys).forEach((key) => trackedLimiterKeys.add(key));
    return {
      keys,
      rows: Object.values(keys).map((key) => ({
        key,
        count: 1,
        resetAt: new Date(now.getTime() + WINDOW_MS),
      })),
    };
  }

  function expectedEnvelope({
    owner,
    identities,
    sessions,
    acceptance,
    currentSessionId,
  }: {
    owner: ReturnType<typeof account>;
    identities: Array<ReturnType<typeof identity>>;
    sessions: Array<ReturnType<typeof session>>;
    acceptance: ReturnType<typeof policyAcceptance> | null;
    currentSessionId: string;
  }) {
    const sections: FixtureJsonValue = {
      account: {
        schemaVersion: 1,
        data: {
          userProvided: {
            name: owner.name,
            email: owner.email,
            image: owner.image,
          },
          observed: {
            status: owner.status,
            emailVerifiedAt: owner.emailVerified.toISOString(),
            createdAt: owner.createdAt.toISOString(),
            updatedAt: owner.updatedAt.toISOString(),
            linkedProviders: identities
              .map(({ provider, type }) => ({ provider, type }))
              .sort((left, right) =>
                `${left.provider}\0${left.type}`.localeCompare(
                  `${right.provider}\0${right.type}`,
                ),
              ),
          },
        },
      },
      activeSessions: {
        schemaVersion: 1,
        data: sessions
          .filter((item) => item.expires > now)
          .map((item) => ({
            observed: {
              createdAt: item.createdAt?.toISOString() ?? null,
              expiresAt: item.expires.toISOString(),
              authenticatedAt: item.authenticatedAt?.toISOString() ?? null,
            },
            derived: {
              current: item.id === currentSessionId,
              recentlyAuthenticated:
                item.authenticatedAt !== null &&
                now.getTime() - item.authenticatedAt.getTime() <= 10 * 60_000,
            },
          })),
      },
      policyAcceptances: {
        schemaVersion: 1,
        data:
          acceptance === null
            ? {}
            : {
                observed: {
                  termsVersion: acceptance.termsVersion,
                  privacyVersion: acceptance.privacyVersion,
                  acceptedAt: acceptance.acceptedAt.toISOString(),
                },
              },
      },
    };
    return canonicalizeFixtureValue({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      manifest: {
        includedSections: [
          { namespace: "account", schemaVersion: 1 },
          { namespace: "activeSessions", schemaVersion: 1 },
          { namespace: "policyAcceptances", schemaVersion: 1 },
        ],
        unavailableSections: [],
      },
      sections,
    });
  }

  async function seedFullGraph(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    const owner = account();
    const identities = [identity(owner, { provider: "fixture-a" })];
    const sessions = [session(owner), session(owner)];
    const acceptance = policyAcceptance(owner);
    const credential = exportCredential(owner);
    const grant = authorization(sessions[0]!, credential.expires);
    const buckets = rateLimitBuckets(owner, sessions[0]!);

    await client.$transaction(async (transaction) => {
      await transaction.user.create({ data: owner });
      await transaction.account.createMany({ data: identities });
      await transaction.session.createMany({ data: sessions });
      await transaction.policyAcceptance.create({ data: acceptance });
      await transaction.$executeRaw`
        INSERT INTO "VerificationToken"
          ("identifier", "token", "expires", "purpose", "locale", "deliveredAt", "createdAt")
        VALUES
          (${credential.identifier}, ${credential.token}, ${credential.expires}, 'ACCOUNT_DATA_EXPORT', ${credential.locale}, ${credential.deliveredAt}, ${credential.createdAt})
      `;
      await transaction.$executeRaw`
        INSERT INTO "DataExportAuthorization" ("sessionId", "confirmedAt", "expiresAt")
        VALUES (${grant.sessionId}, ${grant.confirmedAt}, ${grant.expiresAt})
      `;
      await transaction.rateLimitBucket.createMany({ data: buckets.rows });
    });

    return {
      owner,
      identities,
      sessions,
      acceptance,
      credential,
      grant,
      buckets,
      expectedEnvelope: expectedEnvelope({
        owner,
        identities,
        sessions,
        acceptance,
        currentSessionId: sessions[0]!.id,
      }),
    };
  }

  async function cleanup(database?: DatabaseClient) {
    const client = database ?? (await import("@/lib/db")).db;
    await client.$transaction(async (transaction) => {
      await transaction.verificationToken.deleteMany({
        where: { identifier: { in: [...trackedIdentifiers] } },
      });
      await transaction.rateLimitBucket.deleteMany({
        where: { key: { in: [...trackedLimiterKeys] } },
      });
      await transaction.policyAcceptance.deleteMany({
        where: { userId: { in: [...trackedUserIds] } },
      });
      await transaction.user.deleteMany({
        where: { id: { in: [...trackedUserIds] } },
      });
    });
    trackedUserIds.clear();
    trackedIdentifiers.clear();
    trackedLimiterKeys.clear();
  }

  return {
    scopeId,
    now: new Date(now),
    account,
    identity,
    session,
    policyAcceptance,
    exportCredential,
    authorization,
    rateLimitBuckets,
    expectedEnvelope,
    seedFullGraph,
    cleanup,
  };
}