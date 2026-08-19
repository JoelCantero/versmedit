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
import { createSignupCredential } from "@/modules/signup/token";
import type {
  SanitizedSignupEvent,
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

type IssuanceResult =
  | { kind: "active" }
  | {
      kind: "onboarding";
      rawToken: string;
      tokenHash: string;
    };

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
        delivery.status === "accepted"
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
    if (delivery.status === "accepted") {
      const outcome = "onboarding_sent";
      recordOutcome(outcome, startedAt);
      return { outcome };
    }
  } catch {
    // The exact issued token is compensated below.
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
  const remaining = ACCEPTED_FLOOR_MS + jitter - (now() - startedAt);
  if (remaining > 0) await sleep(remaining);
  return Response.json({ status: "accepted" });
}