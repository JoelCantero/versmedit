import "server-only";

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { getEnv, type Env } from "@/lib/env";

const SMTP_TIMEOUT_MS = 10_000;

type DeliveryOutcome =
  | { status: "accepted" }
  | {
      status: "rejected" | "unknown";
      category: "recipient" | "smtp_5xx" | "smtp_4xx" | "timeout" | "connection" | "partial" | "unclassified";
    };

// Normalized Nodemailer SMTP config pointing at an EXTERNAL transactional email
// provider (SendGrid, Postmark, Mailgun, Amazon SES, Brevo, Resend SMTP, ...),
// never a self-hosted mail server (poor deliverability; constitution → Security).
//
// Email is disabled when SMTP_* is empty. Once any required SMTP value is set,
// env validation requires the complete configuration and fails fast at startup.

export function getSmtpConfig(env: Env = getEnv()) {
  if (!env.SMTP_HOST) return null;

  const port = env.SMTP_PORT ?? 587;

  // Implicit TLS on port 465; STARTTLS on 587/25. `SMTP_SECURE` overrides the
  // port-based default (required by some providers).
  const secure = env.SMTP_SECURE ?? port === 465;

  return {
    server: {
      host: env.SMTP_HOST,
      port,
      secure,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      auth: {
        user: env.SMTP_USER!,
        pass: env.SMTP_PASSWORD!,
      },
    },
    from: env.SMTP_FROM!,
  };
}

export function getEmailProviderConfig(env: Env = getEnv()) {
  if (!env.AUTH_EMAIL_ENABLED) return null;
  return getSmtpConfig(env);
}

export function createSmtpTransport(config: NonNullable<ReturnType<typeof getSmtpConfig>>) {
  return nodemailer.createTransport(config.server);
}

function recipientAddress(recipient: unknown) {
  if (typeof recipient === "string") return recipient.trim().toLowerCase();
  if (
    recipient &&
    typeof recipient === "object" &&
    "address" in recipient &&
    typeof recipient.address === "string"
  ) {
    return recipient.address.trim().toLowerCase();
  }
  return null;
}

function includesRecipient(recipients: unknown, intendedRecipient: string) {
  if (!Array.isArray(recipients)) return false;
  const normalized = intendedRecipient.trim().toLowerCase();
  return recipients.some((recipient) => recipientAddress(recipient) === normalized);
}

export function classifySmtpResult(
  intendedRecipient: string,
  result: Pick<SMTPTransport.SentMessageInfo, "accepted" | "rejected">,
): DeliveryOutcome {
  const accepted = includesRecipient(result.accepted, intendedRecipient);
  const rejected = includesRecipient(result.rejected, intendedRecipient);

  if (accepted && !rejected) return { status: "accepted" };
  if (rejected) return { status: "rejected", category: "recipient" };
  return { status: "unknown", category: "partial" };
}

export function classifySmtpError(error: unknown): DeliveryOutcome {
  if (!error || typeof error !== "object") {
    return { status: "unknown", category: "unclassified" };
  }

  const responseCode =
    "responseCode" in error && typeof error.responseCode === "number"
      ? error.responseCode
      : null;
  if (responseCode && responseCode >= 500 && responseCode < 600) {
    return { status: "rejected", category: "smtp_5xx" };
  }
  if (responseCode && responseCode >= 400 && responseCode < 500) {
    return { status: "unknown", category: "smtp_4xx" };
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) {
    return { status: "unknown", category: "timeout" };
  }
  if (["ECONNRESET", "ECONNREFUSED", "ECONNECTION", "ESOCKET"].includes(code)) {
    return { status: "unknown", category: "connection" };
  }
  return { status: "unknown", category: "unclassified" };
}
