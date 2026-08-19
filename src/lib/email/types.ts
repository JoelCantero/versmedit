import { z } from "zod";

export const EMAIL_SEND_TIMEOUT_MS = 2_500;
export const EMAIL_HEALTH_TIMEOUT_MS = 1_500;
export const EMAIL_RESPONSE_LIMIT_BYTES = 65_536;
export const EMAIL_REQUEST_LIMIT_BYTES = 1_048_576;

export type EmailProviderName = "brevo" | "mailjet";

export type EmailSendCategory =
  | "accepted"
  | "authentication"
  | "rate_limited"
  | "recipient_rejected"
  | "provider_unavailable"
  | "invalid_request"
  | "unknown";

export interface TransactionalEmail {
  recipient: string;
  locale: "en" | "es" | "ca";
  subject: string;
  text: string;
  html: string;
}

export interface NormalizedSendResult {
  accepted: boolean;
  providerMessageId: string | null;
  provider: EmailProviderName;
  category: EmailSendCategory;
}

export interface TransactionalEmailProvider {
  readonly provider: EmailProviderName;
  send(message: TransactionalEmail): Promise<NormalizedSendResult>;
}

export interface ProviderAttemptMetadata {
  statusClass: string | null;
  durationMs: number;
}

export type ProviderAttemptObserver = (
  metadata: ProviderAttemptMetadata,
) => void;

export type ProviderHttpClient = (
  logicalUrl: string,
  init: RequestInit,
) => Promise<Response>;

const noAsciiControls = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value);

const transactionalEmailSchema = z.object({
  recipient: z
    .email()
    .max(320)
    .refine((value) => value === value.trim()),
  locale: z.enum(["en", "es", "ca"]),
  subject: z.string().min(1).refine(noAsciiControls),
  text: z.string().min(1),
  html: z.string().min(1),
}).strict();

export function validateTransactionalEmail(input: unknown): TransactionalEmail {
  const parsed = transactionalEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid transactional email");
  }
  return parsed.data;
}

export function normalizeProviderMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    !noAsciiControls(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function createSendResult(
  provider: EmailProviderName,
  category: EmailSendCategory,
  providerMessageId: unknown = null,
): NormalizedSendResult {
  const accepted = category === "accepted";
  return {
    accepted,
    providerMessageId: accepted
      ? normalizeProviderMessageId(providerMessageId)
      : null,
    provider,
    category,
  };
}