import "server-only";

import {
  Prisma,
  UserStatus,
  VerificationPurpose,
} from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendPersonalDataExportEmail } from "@/modules/account/data-export/email";
import {
  consumePersonalDataExportGenerationSessionLimit,
  consumePersonalDataExportRequestAccountLimit,
} from "@/modules/account/data-export/rate-limit";
import {
  assertJsonValue,
  canonicalJsonStringify,
  serializePersonalDataExportEnvelope,
} from "@/modules/account/data-export/serializer";
import {
  createPersonalDataExportCredential,
  hashPersonalDataExportToken,
} from "@/modules/account/data-export/token";
import {
  PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION,
  type PersonalDataExportAuthorizationState,
  type PersonalDataContribution,
  type PersonalDataExportEnvelopeV1,
  type PersonalDataExportGenerationResult,
  type PersonalDataExportRegistry,
  type PersonalDataExportRequestResult,
  type PersonalDataExportSection,
  type PersonalDataExportVerificationResult,
  type PersonalDataModuleDeclaration,
} from "@/modules/account/data-export/types";
import { resolveActiveAccountSession } from "@/modules/account/session";
import type { AccountLocale } from "@/modules/account/types";

interface IssuePersonalDataExportOptions {
  sessionToken: string;
  locale: AccountLocale;
  origin: string;
  now?: () => Date;
}

interface VerifyPersonalDataExportOptions {
  rawToken: string;
  sessionToken: string | null;
  now?: () => Date;
}

interface GeneratePersonalDataExportOptions {
  sessionToken: string;
  registry: PersonalDataExportRegistry;
}

interface ReadPersonalDataExportAuthorizationOptions {
  sessionToken: string;
  now?: () => Date;
}

function getCredentialLocale(locale: string | null): AccountLocale | null {
  return locale === "en" || locale === "es" || locale === "ca"
    ? locale
    : null;
}

async function lockAccount(
  transaction: Prisma.TransactionClient,
  normalizedEmail: string,
  userId: string,
) {
  await transaction.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}, 0))
  `);
  await transaction.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `);
}

async function compensateProvisionalCredential(
  normalizedEmail: string,
  userId: string,
  token: string,
) {
  await db.$transaction(async (transaction) => {
    await lockAccount(transaction, normalizedEmail, userId);
    await transaction.verificationToken.deleteMany({
      where: {
        identifier: normalizedEmail,
        token,
        purpose: VerificationPurpose.ACCOUNT_DATA_EXPORT,
        deliveredAt: null,
      },
    });
  });
}

export async function issuePersonalDataExport({
  sessionToken,
  locale,
  origin,
  now = () => new Date(),
}: IssuePersonalDataExportOptions): Promise<PersonalDataExportRequestResult> {
  const issuedAt = now();
  const activeSession = await resolveActiveAccountSession(sessionToken, issuedAt);
  if (!activeSession) return { status: "unauthenticated" };
  const accountLimit = await consumePersonalDataExportRequestAccountLimit(
    activeSession.normalizedEmail,
  );
  if (!accountLimit.allowed) {
    return {
      status: "rate_limited",
      retryAfter: accountLimit.retryAfterSeconds,
    };
  }

  const credential = createPersonalDataExportCredential({
    secret: getEnv().AUTH_SECRET,
    issuedAt,
  });

  try {
    const recipient = await db.$transaction(async (transaction) => {
      await lockAccount(
        transaction,
        activeSession.normalizedEmail,
        activeSession.userId,
      );
      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          id: true,
          userId: true,
          expires: true,
          user: {
            select: {
              id: true,
              email: true,
              normalizedEmail: true,
              status: true,
            },
          },
        },
      });
      if (
        !currentSession ||
        currentSession.id !== activeSession.sessionId ||
        currentSession.userId !== activeSession.userId ||
        currentSession.user.id !== activeSession.userId ||
        currentSession.user.normalizedEmail !== activeSession.normalizedEmail ||
        currentSession.user.status !== UserStatus.ACTIVE ||
        currentSession.expires.getTime() <= issuedAt.getTime()
      ) {
        return null;
      }

      await transaction.verificationToken.create({
        data: {
          identifier: activeSession.normalizedEmail,
          token: credential.persisted.token,
          expires: credential.persisted.expires,
          purpose: VerificationPurpose.ACCOUNT_DATA_EXPORT,
          locale,
          deliveredAt: null,
          createdAt: issuedAt,
        },
      });
      return currentSession.user.email;
    });
    if (!recipient) return { status: "unauthenticated" };

    const delivery = await sendPersonalDataExportEmail({
      recipient,
      rawToken: credential.raw,
      locale,
      origin: new URL(origin).origin,
    });
    if (!delivery.accepted) throw new Error("provider rejected export email");

    const finalized = await db.$transaction(async (transaction) => {
      await lockAccount(
        transaction,
        activeSession.normalizedEmail,
        activeSession.userId,
      );
      const deliveredAt = now();
      const updated = await transaction.verificationToken.updateMany({
        where: {
          identifier: activeSession.normalizedEmail,
          token: credential.persisted.token,
          purpose: VerificationPurpose.ACCOUNT_DATA_EXPORT,
          deliveredAt: null,
          expires: { gt: deliveredAt },
        },
        data: { deliveredAt },
      });
      if (updated.count !== 1) return false;

      await transaction.verificationToken.deleteMany({
        where: {
          identifier: activeSession.normalizedEmail,
          purpose: VerificationPurpose.ACCOUNT_DATA_EXPORT,
          deliveredAt: { not: null },
          token: { not: credential.persisted.token },
        },
      });
      return true;
    });
    if (finalized) return { status: "sent" };
  } catch {
    // Compensate only this provisional credential below.
  }

  try {
    await compensateProvisionalCredential(
      activeSession.normalizedEmail,
      activeSession.userId,
      credential.persisted.token,
    );
  } catch {
    // The provisional row may have expired or been removed concurrently.
  }
  return { status: "unavailable" };
}

export async function verifyPersonalDataExport({
  rawToken,
  sessionToken,
  now = () => new Date(),
}: VerifyPersonalDataExportOptions): Promise<PersonalDataExportVerificationResult> {
  const checkedAt = now();
  const token = hashPersonalDataExportToken(rawToken, getEnv().AUTH_SECRET);
  const preflight = await db.verificationToken.findUnique({
    where: { token },
    select: { identifier: true, purpose: true, locale: true },
  });
  if (!preflight || preflight.purpose !== VerificationPurpose.ACCOUNT_DATA_EXPORT) {
    return { status: "invalid", locale: "en" };
  }
  const preflightLocale = getCredentialLocale(preflight.locale) ?? "en";

  try {
    return await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${preflight.identifier}, 0))
      `);
      const storedToken = await transaction.verificationToken.findUnique({
        where: { token },
      });
      const locale = getCredentialLocale(storedToken?.locale ?? null);
      if (
        !storedToken ||
        storedToken.identifier !== preflight.identifier ||
        storedToken.purpose !== VerificationPurpose.ACCOUNT_DATA_EXPORT ||
        !storedToken.deliveredAt ||
        !locale
      ) {
        return { status: "invalid" as const, locale: preflightLocale };
      }
      if (storedToken.expires.getTime() <= checkedAt.getTime()) {
        return {
          status: "invalid" as const,
          locale,
          auditOutcome: "confirmation_expired" as const,
        };
      }

      const owner = await transaction.user.findUnique({
        where: { normalizedEmail: storedToken.identifier },
        select: { id: true, status: true },
      });
      if (!owner || owner.status !== UserStatus.ACTIVE) {
        return { status: "invalid" as const, locale };
      }
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${owner.id}, 0))
      `);

      if (!sessionToken) return { status: "invalid" as const, locale };
      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          id: true,
          userId: true,
          expires: true,
          user: { select: { id: true, status: true } },
        },
      });
      if (
        !currentSession ||
        currentSession.userId !== owner.id ||
        currentSession.user.id !== owner.id ||
        currentSession.user.status !== UserStatus.ACTIVE ||
        currentSession.expires.getTime() <= checkedAt.getTime()
      ) {
        return { status: "invalid" as const, locale };
      }

      const consumed = await transaction.verificationToken.deleteMany({
        where: {
          identifier: storedToken.identifier,
          token,
          purpose: VerificationPurpose.ACCOUNT_DATA_EXPORT,
          deliveredAt: { not: null },
          expires: { gt: checkedAt },
        },
      });
      if (consumed.count !== 1) {
        return { status: "invalid" as const, locale };
      }
      await transaction.dataExportAuthorization.upsert({
        where: { sessionId: currentSession.id },
        create: {
          sessionId: currentSession.id,
          confirmedAt: checkedAt,
          expiresAt: storedToken.expires,
        },
        update: {
          confirmedAt: checkedAt,
          expiresAt: storedToken.expires,
        },
      });

      return { status: "ready" as const, locale };
    });
  } catch {
    return { status: "invalid", locale: preflightLocale };
  }
}

interface TransactionTimestampRow {
  generatedAt: Date;
}

function invalidContribution(): never {
  throw new Error("Invalid personal data export contribution");
}

function validateContribution(
  value: unknown,
  declaration: PersonalDataModuleDeclaration,
): PersonalDataContribution {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalidContribution();
  }
  const contribution = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(contribution);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(contribution, key);
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    invalidContribution();
  }

  if (
    contribution.status === "included" &&
    keys.length === 2 &&
    keys.includes("data")
  ) {
    assertJsonValue(contribution.data);
    return contribution as unknown as PersonalDataContribution;
  }
  if (
    contribution.status === "unavailable" &&
    keys.length === 2 &&
    keys.includes("reason") &&
    typeof contribution.reason === "string" &&
    declaration.unavailableReasons.includes(contribution.reason)
  ) {
    return contribution as unknown as PersonalDataContribution;
  }
  invalidContribution();
}

function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export async function readPersonalDataExportAuthorization({
  sessionToken,
  now = () => new Date(),
}: ReadPersonalDataExportAuthorizationOptions): Promise<PersonalDataExportAuthorizationState> {
  const checkedAt = now();
  const session = await db.session.findUnique({
    where: { sessionToken },
    select: {
      expires: true,
      user: { select: { status: true } },
      dataExportAuthorization: { select: { expiresAt: true } },
    },
  });
  if (
    !session ||
    session.user.status !== UserStatus.ACTIVE ||
    session.expires.getTime() <= checkedAt.getTime()
  ) {
    return { status: "absent" };
  }
  if (!session.dataExportAuthorization) return { status: "absent" };
  if (
    session.dataExportAuthorization.expiresAt.getTime() <= checkedAt.getTime()
  ) {
    return { status: "expired" };
  }
  return {
    status: "ready",
    expiresAt: session.dataExportAuthorization.expiresAt.toISOString(),
  };
}

export async function generatePersonalDataExport({
  sessionToken,
  registry,
}: GeneratePersonalDataExportOptions): Promise<PersonalDataExportGenerationResult> {
  const activeSession = await resolveActiveAccountSession(sessionToken);
  if (!activeSession) return { status: "unauthenticated" };
  const sessionLimit = await consumePersonalDataExportGenerationSessionLimit(
    activeSession.sessionId,
  );
  if (!sessionLimit.allowed) {
    return {
      status: "rate_limited",
      retryAfter: sessionLimit.retryAfterSeconds,
    };
  }

  const env = getEnv();
  const startedAt = performance.now();
  const deadline = startedAt + env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS;
  const abortController = new AbortController();
  let auditOutcome: "contributor_failed" | undefined;
  const timeout = setTimeout(
    () => abortController.abort(new Error("Personal data export timed out")),
    env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS,
  );

  function assertWithinDeadline() {
    if (!abortController.signal.aborted && performance.now() >= deadline) {
      abortController.abort(new Error("Personal data export timed out"));
    }
    abortController.signal.throwIfAborted();
  }

  try {
    assertWithinDeadline();
    return await db.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        await transaction.$queryRaw(Prisma.sql`
          SELECT set_config(
            'statement_timeout',
            ${String(env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS)},
            true
          )
        `);
        const [clock] = await transaction.$queryRaw<TransactionTimestampRow[]>(
          Prisma.sql`SELECT transaction_timestamp() AS "generatedAt"`,
        );
        if (!clock) throw new Error("Snapshot timestamp unavailable");
        assertWithinDeadline();

        const currentSession = await transaction.session.findUnique({
          where: { sessionToken },
          select: {
            id: true,
            userId: true,
            expires: true,
            user: { select: { id: true, status: true } },
            dataExportAuthorization: {
              select: { expiresAt: true },
            },
          },
        });
        if (
          !currentSession ||
          currentSession.id !== activeSession.sessionId ||
          currentSession.userId !== activeSession.userId ||
          currentSession.userId !== currentSession.user.id ||
          currentSession.user.status !== UserStatus.ACTIVE ||
          currentSession.expires.getTime() <= clock.generatedAt.getTime()
        ) {
          return { status: "unauthenticated" as const };
        }
        if (
          !currentSession.dataExportAuthorization ||
          currentSession.dataExportAuthorization.expiresAt.getTime() <=
            clock.generatedAt.getTime()
        ) {
          return { status: "not_ready" as const };
        }

        const generatedAt = clock.generatedAt.toISOString();
        const includedSections: Array<{
          namespace: string;
          schemaVersion: number;
        }> = [];
        const unavailableSections: Array<{
          namespace: string;
          schemaVersion: number;
          reason: string;
        }> = [];
        const sections: Record<string, PersonalDataExportSection> = {};

        for (const contributor of registry.contributors) {
          assertWithinDeadline();
          let contribution: PersonalDataContribution;
          try {
            const declaration = registry.getDeclaration(contributor.namespace);
            if (
              !declaration ||
              declaration.schemaVersion !== contributor.schemaVersion
            ) {
              invalidContribution();
            }
            const context = Object.freeze({
              userId: currentSession.userId,
              currentSessionId: currentSession.id,
              generatedAt: new Date(clock.generatedAt.getTime()),
              transaction,
              signal: abortController.signal,
            });
            contribution = validateContribution(
              await awaitWithAbort(
                Promise.resolve(contributor.contribute(context)),
                abortController.signal,
              ),
              declaration,
            );
            assertWithinDeadline();
            const repeatedContribution = validateContribution(
              await awaitWithAbort(
                Promise.resolve(contributor.contribute(context)),
                abortController.signal,
              ),
              declaration,
            );
            if (
              canonicalJsonStringify(repeatedContribution) !==
              canonicalJsonStringify(contribution)
            ) {
              invalidContribution();
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              auditOutcome = "contributor_failed";
            }
            throw error;
          }
          assertWithinDeadline();
          if (contribution.status === "included") {
            includedSections.push({
              namespace: contributor.namespace,
              schemaVersion: contributor.schemaVersion,
            });
            sections[contributor.namespace] = {
              schemaVersion: contributor.schemaVersion,
              data: contribution.data,
            };
          } else {
            unavailableSections.push({
              namespace: contributor.namespace,
              schemaVersion: contributor.schemaVersion,
              reason: contribution.reason,
            });
          }
        }

        assertWithinDeadline();
        const envelope: PersonalDataExportEnvelopeV1 = {
          schemaVersion: PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION,
          generatedAt,
          manifest: { includedSections, unavailableSections },
          sections,
        };
        const serialized = serializePersonalDataExportEnvelope(
          envelope,
          env.ACCOUNT_DATA_EXPORT_MAX_BYTES,
        );
        assertWithinDeadline();
        return {
          status: "completed" as const,
          export: serialized,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: Math.min(5_000, env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS),
        timeout: env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS,
      },
    );
  } catch {
    return auditOutcome
      ? { status: "unavailable", auditOutcome }
      : { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}