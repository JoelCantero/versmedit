import "server-only";

import {
  Prisma,
  UserStatus,
  VerificationPurpose,
} from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  sendActiveAccountEmail,
  sendOnboardingEmail,
} from "@/modules/signup/email";
import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from "@/modules/signup/policy";
import {
  createSignupCredential,
  hashSignupToken,
} from "@/modules/signup/token";
import type {
  SanitizedSignupEvent,
  SignupLocale,
  SignupLifecycleOutcome,
  SignupLifecycleResult,
  ValidatedSignupRequest,
} from "@/modules/signup/types";

const ACCEPTED_FLOOR_MS = 500;
const ACCEPTED_JITTER_MS = 100;

interface ProcessSignupOptions {
  now?: () => Date;
}

interface AcceptedSignupResponseOptions {
  startedAt: number;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface SignupActivationPreflightOptions {
  now?: () => Date;
}

export type SignupActivationCandidate = {
  userId: string;
  identifier: string;
  tokenHash: string;
  locale: SignupLocale;
};

export type SignupActivationPreflightResult =
  | { status: "invalid_link"; locale: SignupLocale }
  | { status: "eligible_candidate"; candidate: SignupActivationCandidate };

export type SignupActivationSessionResult =
  | { status: "eligible"; candidate: SignupActivationCandidate }
  | { status: "session_conflict"; locale: SignupLocale };

export type SignupActivationFailureResult =
  | { status: "session_failed"; locale: SignupLocale }
  | { status: "invalid_link"; locale: SignupLocale };

type IssuanceResult =
  | { kind: "active" }
  | {
      kind: "onboarding";
      rawToken: string;
      tokenHash: string;
    };

function isSignupLocale(value: unknown): value is SignupLocale {
  return value === "en" || value === "es" || value === "ca";
}

export async function preflightSignupActivation(
  rawToken: string,
  { now = () => new Date() }: SignupActivationPreflightOptions = {},
): Promise<SignupActivationPreflightResult> {
  const tokenHash = hashSignupToken(rawToken, getEnv().AUTH_SECRET);
  const storedToken = await db.verificationToken.findUnique({
    where: { token: tokenHash },
  });
  const locale: SignupLocale = isSignupLocale(storedToken?.locale)
    ? storedToken.locale
    : "en";
  if (
    !storedToken ||
    storedToken.purpose !== VerificationPurpose.SIGNUP ||
    !storedToken.deliveredAt ||
    storedToken.expires.getTime() <= now().getTime()
  ) {
    return { status: "invalid_link", locale };
  }

  const targetUser = await db.user.findUnique({
    where: { normalizedEmail: storedToken.identifier },
    select: { id: true, status: true },
  });
  if (!targetUser || targetUser.status !== UserStatus.PENDING) {
    return { status: "invalid_link", locale };
  }

  return {
    status: "eligible_candidate",
    candidate: {
      userId: targetUser.id,
      identifier: storedToken.identifier,
      tokenHash,
      locale,
    },
  };
}

export function evaluateSignupActivationSession(
  candidate: SignupActivationCandidate,
  currentUserId: string | null,
): SignupActivationSessionResult {
  if (currentUserId && currentUserId !== candidate.userId) {
    return { status: "session_conflict", locale: candidate.locale };
  }
  return { status: "eligible", candidate };
}

export async function resolveSignupActivationFailure(
  candidate: SignupActivationCandidate,
): Promise<SignupActivationFailureResult> {
  const [remainingToken, activatedUser] = await Promise.all([
    db.verificationToken.findUnique({
      where: { token: candidate.tokenHash },
      select: { token: true },
    }),
    db.user.findUnique({
      where: { id: candidate.userId },
      select: { status: true },
    }),
  ]);
  if (!remainingToken && activatedUser?.status === UserStatus.ACTIVE) {
    return { status: "session_failed", locale: candidate.locale };
  }
  return { status: "invalid_link", locale: candidate.locale };
}

function recordOutcome(outcome: SignupLifecycleOutcome, startedAt: number) {
  const event: SanitizedSignupEvent = {
    category: "signup_submission",
    outcome,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
  if (
    outcome === "processing_failed" ||
    outcome === "onboarding_delivery_failed" ||
    outcome === "active_notice_failed"
  ) {
    logger.warn(event, "signup submission completed");
  } else {
    logger.info(event, "signup submission completed");
  }
}

async function compensateFailedToken(identifier: string, token: string) {
  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))
    `);
    await transaction.verificationToken.deleteMany({
      where: {
        identifier,
        token,
        purpose: VerificationPurpose.SIGNUP,
      },
    });
  });
}

async function confirmDeliveredToken(
  identifier: string,
  token: string,
  deliveredAt: Date,
) {
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))
    `);
    const confirmed = await transaction.verificationToken.updateMany({
      where: {
        identifier,
        token,
        purpose: VerificationPurpose.SIGNUP,
        deliveredAt: null,
      },
      data: { deliveredAt },
    });
    return confirmed.count === 1;
  });
}

export async function processSignup(
  request: ValidatedSignupRequest,
  { now = () => new Date() }: ProcessSignupOptions = {},
): Promise<SignupLifecycleResult> {
  const startedAt = Date.now();
  const env = getEnv();
  const origin = new URL(env.NEXTAUTH_URL).origin;
  let issuance: IssuanceResult;

  try {
    issuance = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${request.email}, 0))
      `);

      let user = await transaction.user.findUnique({
        where: { normalizedEmail: request.email },
        select: { id: true, normalizedEmail: true, status: true },
      });

      if (!user) {
        user = await transaction.user.create({
          data: {
            email: request.email,
            normalizedEmail: request.email,
            name: null,
            status: UserStatus.PENDING,
          },
          select: { id: true, normalizedEmail: true, status: true },
        });
      }

      if (user.status === UserStatus.ACTIVE) {
        return { kind: "active" } as const;
      }

      const issuedAt = now();
      const credential = createSignupCredential({
        secret: env.AUTH_SECRET,
        issuedAt,
      });
      await transaction.verificationToken.deleteMany({
        where: {
          identifier: request.email,
          purpose: VerificationPurpose.SIGNUP,
        },
      });
      await transaction.verificationToken.create({
        data: {
          identifier: request.email,
          token: credential.persisted.token,
          expires: credential.persisted.expires,
          purpose: VerificationPurpose.SIGNUP,
          proposedName: request.name,
          locale: request.locale,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_NOTICE_VERSION,
          acceptedAt: issuedAt,
          deliveredAt: null,
          createdAt: issuedAt,
        },
      });

      return {
        kind: "onboarding",
        rawToken: credential.raw,
        tokenHash: credential.persisted.token,
      } as const;
    });
  } catch {
    const outcome = "processing_failed";
    recordOutcome(outcome, startedAt);
    return { outcome };
  }

  if (issuance.kind === "active") {
    try {
      const delivery = await sendActiveAccountEmail({
        recipient: request.email,
        locale: request.locale,
        origin,
      });
      const outcome =
        delivery.accepted
          ? "active_notice_sent"
          : "active_notice_failed";
      recordOutcome(outcome, startedAt);
      return { outcome };
    } catch {
      const outcome = "active_notice_failed";
      recordOutcome(outcome, startedAt);
      return { outcome };
    }
  }

  try {
    const delivery = await sendOnboardingEmail({
      recipient: request.email,
      rawToken: issuance.rawToken,
      locale: request.locale,
      origin,
    });
    if (delivery.accepted) {
      const confirmed = await confirmDeliveredToken(
        request.email,
        issuance.tokenHash,
        now(),
      );
      if (confirmed) {
        const outcome = "onboarding_sent";
        recordOutcome(outcome, startedAt);
        return { outcome };
      }
    }
  } catch {
    // The provisional exact token is compensated below.
  }

  try {
    await compensateFailedToken(request.email, issuance.tokenHash);
  } catch {
    // A later signup or activation may already have removed the exact token.
  }
  const outcome = "onboarding_delivery_failed";
  recordOutcome(outcome, startedAt);
  return { outcome };
}

export async function acceptedSignupResponse({
  startedAt,
  now = Date.now,
  random = Math.random,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: AcceptedSignupResponseOptions) {
  const jitter = Math.floor(random() * (ACCEPTED_JITTER_MS + 1));
  const targetAt = startedAt + ACCEPTED_FLOOR_MS + jitter;
  let remaining = targetAt - now();
  while (remaining > 0) {
    await sleep(remaining);
    remaining = targetAt - now();
  }
  return Response.json({ status: "accepted" });
}