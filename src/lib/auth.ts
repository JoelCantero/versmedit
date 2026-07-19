import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import Email from "next-auth/providers/email";
import nodemailer from "nodemailer";

import { hardenAdapter } from "@/lib/auth-adapter";
import { db } from "@/lib/db";
import {
  classifySmtpResult,
  getEmailProviderConfig,
} from "@/lib/email";
import { createSignupToken } from "@/modules/signup/token";

// NextAuth v4 stable (App Router). Database-backed sessions via the Prisma adapter, with
// passwordless email sign-in through the project's SMTP (Nodemailer) settings.
// `AUTH_SECRET` is read from the environment automatically. Add more providers
// here as features require them (constitution Principle XI).
const smtp = getEmailProviderConfig();

type SignupLocale = "en" | "es" | "ca";
type RecoveryReason = "invalid" | "expired" | "superseded" | "used";

const recoveryReasons: RecoveryReason[] = ["invalid", "expired", "superseded", "used"];

function localePath(path: string, locale: SignupLocale) {
  if (locale === "en") return path;
  return `/${locale}${path}`;
}

function parseLocaleFromPathname(pathname: string): SignupLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment === "es" || firstSegment === "ca" ? firstSegment : "en";
}

function parseLocaleFromCallbackUrl(callbackUrl: string | null, baseUrl: string): SignupLocale {
  if (!callbackUrl) return "en";

  try {
    return parseLocaleFromPathname(new URL(callbackUrl, baseUrl).pathname);
  } catch {
    return "en";
  }
}

function parseRecoveryReason(searchParams: URLSearchParams): RecoveryReason {
  const reason = searchParams.get("reason");
  return recoveryReasons.includes(reason as RecoveryReason)
    ? (reason as RecoveryReason)
    : "invalid";
}

function localizeAuthRedirect(url: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const target = new URL(url, baseUrl);
  const locale = parseLocaleFromCallbackUrl(target.searchParams.get("callbackUrl"), baseUrl);
  const isAuthErrorRoute =
    target.pathname === "/api/auth/error" || target.pathname === "/api/auth/signin";

  if (isAuthErrorRoute && target.searchParams.get("error") === "Verification") {
    const errorUrl = new URL(localePath("/signup/error", locale), base);
    errorUrl.searchParams.set("reason", parseRecoveryReason(target.searchParams));
    return errorUrl.toString();
  }

  if (target.pathname === "/signup/error" && locale !== "en") {
    const localizedError = new URL(localePath("/signup/error", locale), base);
    for (const [key, value] of target.searchParams.entries()) {
      localizedError.searchParams.set(key, value);
    }
    return localizedError.toString();
  }

  return target.origin === base.origin ? target.toString() : base.toString();
}

export const authOptions: NextAuthOptions = {
  adapter: hardenAdapter(PrismaAdapter(db)),
  session: { strategy: "database" },
  pages: {
    error: "/signup/error",
  },
  callbacks: {
    redirect: ({ url, baseUrl }) => localizeAuthRedirect(url, baseUrl),
  },
  // NEXTAUTH_URL is required and validated as a canonical origin, so forwarded
  // Host values cannot control callback or verification URLs.
  providers: smtp
    ? [
        Email({
          // Magic-link token lifetime: 15 minutes (default is 24h). Shorter TTL
          // reduces the window an intercepted link stays valid.
          maxAge: 15 * 60,
          generateVerificationToken: () => createSignupToken().raw,
          sendVerificationRequest: async ({ identifier, url, provider }) => {
            const transport = nodemailer.createTransport(provider.server);
            try {
              const result = await transport.sendMail({
                to: identifier,
                from: provider.from,
                subject: "Your Versmedit sign-in link",
                text: `Use this link to sign in: ${url}`,
                html: `<p>Use this link to sign in:</p><p><a href="${url}">${url}</a></p>`,
              });
              const outcome = classifySmtpResult(identifier, {
                accepted: result.accepted,
                rejected: result.rejected,
              });
              if (outcome.status !== "accepted") {
                throw new Error("email provider did not accept intended recipient");
              }
            } finally {
              if (typeof transport.close === "function") transport.close();
            }
          },
          server: smtp.server,
          from: smtp.from,
        }),
      ]
    : [],
};
