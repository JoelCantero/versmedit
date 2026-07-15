import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import Email from "next-auth/providers/email";

import { hardenAdapter } from "@/lib/auth-adapter";
import { db } from "@/lib/db";
import { getSmtpConfig } from "@/lib/email";
import { getEnv } from "@/lib/env";

// NextAuth v4 stable (App Router). Database-backed sessions via the Prisma adapter, with
// passwordless email sign-in through the project's SMTP (Nodemailer) settings.
// `AUTH_SECRET` is read from the environment automatically. Add more providers
// here as features require them (constitution Principle XI).
const smtp = getSmtpConfig();
const emailAuthEnabled = getEnv().AUTH_EMAIL_ENABLED;

export const authOptions: NextAuthOptions = {
  adapter: hardenAdapter(PrismaAdapter(db)),
  session: { strategy: "database" },
  // NEXTAUTH_URL is required and validated as a canonical origin, so forwarded
  // Host values cannot control callback or verification URLs.
  providers: emailAuthEnabled && smtp
    ? [
        Email({
          // Magic-link token lifetime: 15 minutes (default is 24h). Shorter TTL
          // reduces the window an intercepted link stays valid.
          maxAge: 15 * 60,
          server: smtp.server,
          from: smtp.from,
        }),
      ]
    : [],
};
