import { z } from "zod";

import {
  EMAIL_HEALTH_TIMEOUT_MS,
  EMAIL_RESPONSE_LIMIT_BYTES,
  EMAIL_SEND_TIMEOUT_MS,
} from "@/lib/email/types";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

export interface DisabledMailConfig {
  enabled: false;
}

interface EnabledMailConfigBase {
  enabled: true;
  apiKey: string;
  fromEmail: string;
  senderName: string;
  sendTimeoutMs: typeof EMAIL_SEND_TIMEOUT_MS;
  healthTimeoutMs: typeof EMAIL_HEALTH_TIMEOUT_MS;
  responseLimitBytes: typeof EMAIL_RESPONSE_LIMIT_BYTES;
}

export interface BrevoMailConfig extends EnabledMailConfigBase {
  provider: "brevo";
}

export interface MailjetMailConfig extends EnabledMailConfigBase {
  provider: "mailjet";
  apiSecret: string;
}

export type MailConfig =
  | DisabledMailConfig
  | BrevoMailConfig
  | MailjetMailConfig;

const rawEnvSchema = z
  .object({
    PROJECT_NAME: z.string().min(1, "PROJECT_NAME is required"),
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
    // At least 32 chars: matches `openssl rand -base64 32` output and rejects weak
    // or placeholder secrets at startup (constitution Principle X).
    AUTH_SECRET: z
      .string()
      .min(32, "AUTH_SECRET must be at least 32 characters (use `openssl rand -base64 32`)"),
    NEXTAUTH_URL: z
      .url("NEXTAUTH_URL must be a valid URL")
      .refine((value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === ""
        );
      }, "NEXTAUTH_URL must be an HTTP(S) origin without a path, query, or fragment"),
    // Pino log level. Optional: the logger defaults to `info` in production and
    // `debug` otherwise (constitution Principle VIII). An empty string (e.g. an
    // unset GitHub Variable passed through by Compose) is treated as unset; any
    // other invalid value fails fast.
    LOG_LEVEL: z.preprocess(
      emptyToUndefined,
      z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    ),
    MAIL_ENABLED: z.preprocess(
      emptyToUndefined,
      z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    ),
    MAIL_PROVIDER: optionalString,
    MAIL_API_KEY: optionalString,
    MAIL_API_SECRET: optionalString,
    MAIL_FROM: optionalString,
    TRUST_PROXY_HEADERS: z.preprocess(
      emptyToUndefined,
      z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    ),
  })
  .superRefine((env, context) => {
    if (!env.MAIL_ENABLED) return;

    if (env.MAIL_PROVIDER !== "brevo" && env.MAIL_PROVIDER !== "mailjet") {
      context.addIssue({
        code: "custom",
        path: ["MAIL_PROVIDER"],
        message: "MAIL_PROVIDER must be brevo or mailjet when mail is enabled",
      });
    }
    if (env.MAIL_API_KEY === undefined) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_API_KEY"],
        message: "MAIL_API_KEY is required when mail is enabled",
      });
    }
    if (env.MAIL_PROVIDER === "mailjet" && env.MAIL_API_SECRET === undefined) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_API_SECRET"],
        message: "MAIL_API_SECRET is required for Mailjet",
      });
    }

    const sender = env.MAIL_FROM;
    if (
      sender === undefined ||
      sender !== sender.trim() ||
      !z.email().safeParse(sender).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_FROM"],
        message: "MAIL_FROM must be one bare email address",
      });
    }

    const senderName = env.PROJECT_NAME.trim();
    if (
      senderName.length === 0 ||
      senderName.length > 70 ||
      /[\u0000-\u001f\u007f]/u.test(senderName)
    ) {
      context.addIssue({
        code: "custom",
        path: ["PROJECT_NAME"],
        message: "PROJECT_NAME must be a safe sender name of 1-70 characters",
      });
    }
  });

type RawEnv = z.infer<typeof rawEnvSchema>;

export type Env = Pick<
  RawEnv,
  | "PROJECT_NAME"
  | "DATABASE_URL"
  | "AUTH_SECRET"
  | "NEXTAUTH_URL"
  | "LOG_LEVEL"
  | "TRUST_PROXY_HEADERS"
> & { MAIL: MailConfig };

const envSchema = rawEnvSchema.transform((env): Env => {
  const base = {
    PROJECT_NAME: env.PROJECT_NAME,
    DATABASE_URL: env.DATABASE_URL,
    AUTH_SECRET: env.AUTH_SECRET,
    NEXTAUTH_URL: env.NEXTAUTH_URL,
    LOG_LEVEL: env.LOG_LEVEL,
    TRUST_PROXY_HEADERS: env.TRUST_PROXY_HEADERS,
  };

  if (!env.MAIL_ENABLED) {
    return { ...base, MAIL: { enabled: false } };
  }

  const common = {
    enabled: true as const,
    apiKey: env.MAIL_API_KEY!,
    fromEmail: env.MAIL_FROM!,
    senderName: env.PROJECT_NAME.trim(),
    sendTimeoutMs: EMAIL_SEND_TIMEOUT_MS,
    healthTimeoutMs: EMAIL_HEALTH_TIMEOUT_MS,
    responseLimitBytes: EMAIL_RESPONSE_LIMIT_BYTES,
  } as const;

  if (env.MAIL_PROVIDER === "mailjet") {
    return {
      ...base,
      MAIL: {
        ...common,
        provider: "mailjet",
        apiSecret: env.MAIL_API_SECRET!,
      },
    };
  }

  return {
    ...base,
    MAIL: {
      ...common,
      provider: "brevo",
    },
  };
});

export function validateEnv(env: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export function getEnv(envSource: NodeJS.ProcessEnv = process.env): Env {
  return validateEnv(envSource);
}
