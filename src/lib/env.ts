import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const envSchema = z
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
    SMTP_HOST: optionalString,
    SMTP_PORT: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(65535).optional(),
    ),
    SMTP_SECURE: z.preprocess(
      emptyToUndefined,
      z.enum(["true", "false"]).transform((value) => value === "true").optional(),
    ),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_FROM: optionalString,
    AUTH_EMAIL_ENABLED: z.preprocess(
      emptyToUndefined,
      z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    ),
    TRUST_PROXY_HEADERS: z.preprocess(
      emptyToUndefined,
      z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    ),
  })
  .superRefine((env, context) => {
    const smtpFields = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const;
    const smtpEnabled = smtpFields.some((field) => env[field] !== undefined);

    if (smtpEnabled) {
      for (const field of smtpFields) {
        if (env[field] === undefined) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when SMTP is configured`,
          });
        }
      }
    }

    if (env.AUTH_EMAIL_ENABLED && !smtpEnabled) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_EMAIL_ENABLED"],
        message: "AUTH_EMAIL_ENABLED requires a complete SMTP configuration",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

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
