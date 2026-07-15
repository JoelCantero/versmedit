import "server-only";

import { getEnv, type Env } from "@/lib/env";

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
      auth: {
        user: env.SMTP_USER!,
        pass: env.SMTP_PASSWORD!,
      },
    },
    from: env.SMTP_FROM!,
  };
}
