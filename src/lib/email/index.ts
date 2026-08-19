import "server-only";

import { createBrevoProvider } from "@/lib/email/brevo";
import { nativeProviderHttpClient } from "@/lib/email/http";
import { createMailjetProvider } from "@/lib/email/mailjet";
import {
  validateTransactionalEmail,
  type ProviderAttemptMetadata,
  type ProviderAttemptObserver,
  type ProviderHttpClient,
  type TransactionalEmail,
  type TransactionalEmailProvider,
} from "@/lib/email/types";
import {
  getEnv,
  type BrevoMailConfig,
  type MailConfig,
  type MailjetMailConfig,
} from "@/lib/env";
import { logger } from "@/lib/logger";
import { createRequestId } from "@/lib/request-context";

export type EnabledMailConfig = BrevoMailConfig | MailjetMailConfig;

export function createTransactionalEmailProvider(
  config: EnabledMailConfig,
  client: ProviderHttpClient = nativeProviderHttpClient,
  observeAttempt?: ProviderAttemptObserver,
): TransactionalEmailProvider {
  return config.provider === "brevo"
    ? createBrevoProvider(config, client, observeAttempt)
    : createMailjetProvider(config, client, observeAttempt);
}

function requireEnabledMail(config: MailConfig): EnabledMailConfig {
  if (!config.enabled) {
    throw new Error("Transactional email is disabled");
  }
  return config;
}

export async function sendTransactionalEmail(
  input: TransactionalEmail,
  config: MailConfig = getEnv().MAIL,
  client: ProviderHttpClient = nativeProviderHttpClient,
  { correlationId }: { correlationId?: string } = {},
) {
  const message = validateTransactionalEmail(input);
  let attempt: ProviderAttemptMetadata | null = null;
  const result = await createTransactionalEmailProvider(
    requireEnabledMail(config),
    client,
    (metadata) => {
      attempt = metadata;
    },
  ).send(message);
  if (attempt) {
    const observedAttempt: ProviderAttemptMetadata = attempt;
    const safeCorrelationId =
      correlationId && /^[A-Za-z0-9._:-]{1,128}$/.test(correlationId)
        ? correlationId
        : createRequestId();
    const safeProviderMessageId =
      result.providerMessageId &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(result.providerMessageId)
        ? result.providerMessageId
        : null;
    logger.info(
      {
        event: "transactional_email_submission",
        provider: result.provider,
        category: result.category,
        accepted: result.accepted,
        providerMessageId: safeProviderMessageId,
        statusClass: observedAttempt.statusClass,
        durationMs: Math.max(0, observedAttempt.durationMs),
        correlationId: safeCorrelationId,
      },
      result.accepted
        ? "transactional email submission accepted"
        : "transactional email submission not accepted",
    );
  }
  return result;
}