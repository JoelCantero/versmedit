import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import Email from "next-auth/providers/email";
import nodemailer from "nodemailer";

import { hardenAdapter } from "@/lib/auth-adapter";
import { db } from "@/lib/db";
import {
  classifySmtpError,
  classifySmtpResult,
  formatEmailSubject,
  getEmailProviderConfig,
} from "@/lib/email";
import { getEnv } from "@/lib/env";
import {
  isProviderWideFailure,
  markProviderUnavailable,
} from "@/lib/provider-availability";
import { logger } from "@/lib/logger";
import { getPublishedVerificationToken } from "@/modules/login/verification-context";
import { createSignupToken } from "@/modules/signup/token";

// NextAuth v4 stable (App Router). Database-backed sessions via the Prisma adapter, with
// passwordless email sign-in through the project's SMTP (Nodemailer) settings.
// `AUTH_SECRET` is read from the environment automatically. Add more providers
// here as features require them (constitution Principle XI).
const smtp = getEmailProviderConfig();
const projectName = getEnv().PROJECT_NAME;

function createSignupProvider(config: NonNullable<typeof smtp>) {
  const provider = Email({
    maxAge: 15 * 60,
    generateVerificationToken: () => createSignupToken().raw,
    sendVerificationRequest: async () => {
      throw new Error("Signup provider cannot initiate delivery");
    },
    server: config.server,
    from: config.from,
  });
  Object.assign(
    provider as unknown as { id: string; name: string },
    { id: "signup", name: "Signup" },
  );
  return provider;
}

type SignupLocale = "en" | "es" | "ca";
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

const emailCopy: Record<SignupLocale, { subject: string; text: string }> = {
  en: {
    subject: "Your {projectName} sign-in link",
    text: "Use this link to sign in",
  },
  es: {
    subject: "Tu enlace de acceso a {projectName}",
    text: "Usa este enlace para iniciar sesión",
  },
  ca: {
    subject: "El teu enllaç d'accés a {projectName}",
    text: "Utilitza aquest enllaç per iniciar sessió",
  },
};

function localizeAuthRedirect(url: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const target = new URL(url, baseUrl);
  const locale = parseLocaleFromCallbackUrl(target.searchParams.get("callbackUrl"), baseUrl);
  const isAuthErrorRoute =
    target.pathname === "/api/auth/error" || target.pathname === "/api/auth/signin";

  if (isAuthErrorRoute && target.searchParams.get("error") === "Verification") {
    return new URL(localePath("/login/error", locale), base).toString();
  }

  if (target.pathname === "/login/error") {
    return new URL(localePath("/login/error", locale), base).toString();
  }

  return target.origin === base.origin ? target.toString() : base.toString();
}

export const authOptions: NextAuthOptions = {
  adapter: hardenAdapter(PrismaAdapter(db)),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    error: "/login/error",
  },
  callbacks: {
    session: async ({ session, user }) => {
      if (!session.user) {
        return session;
      }

      const directId =
        typeof user?.id === "string" && user.id.length > 0 ? user.id : null;
      const sessionEmail =
        typeof session.user.email === "string" && session.user.email.length > 0
          ? session.user.email
          : null;
      const resolvedFromEmail =
        !directId && sessionEmail
          ? await db.user.findUnique({
              where: { email: sessionEmail },
              select: { id: true },
            })
          : null;
      const resolvedId = directId ?? resolvedFromEmail?.id ?? null;

      if (resolvedId) {
        return {
          ...session,
          user: {
            ...session.user,
            id: resolvedId,
          },
        };
      }

      return session;
    },
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
            let deliveryFailure: ReturnType<typeof classifySmtpError> | undefined;
            const verificationUrl = new URL(url);
            const locale = parseLocaleFromCallbackUrl(
              verificationUrl.searchParams.get("callbackUrl"),
              verificationUrl.origin,
            );
            const copy = emailCopy[locale];
            try {
              const result = await transport.sendMail({
                to: identifier,
                from: provider.from,
                subject: formatEmailSubject(copy.subject, projectName),
                text: `${copy.text}: ${url}`,
                html: `<p>${copy.text}:</p><p><a href="${url}">${url}</a></p>`,
              });
              const outcome = classifySmtpResult(identifier, {
                accepted: result.accepted,
                rejected: result.rejected,
              });
              logger.info(
                {
                  event: "email_delivery_accepted",
                  messageId: result.messageId,
                  acceptedCount: result.accepted.length,
                  rejectedCount: result.rejected.length,
                },
                "email delivery accepted by SMTP provider",
              );
              if (outcome.status !== "accepted") {
                deliveryFailure = outcome;
                throw new Error("email provider did not accept intended recipient");
              }
            } catch (error) {
              const outcome = deliveryFailure ?? classifySmtpError(error);
              logger.error(
                {
                  event: "email_delivery_failed",
                  category: "category" in outcome ? outcome.category : undefined,
                  status: outcome.status,
                  code:
                    error && typeof error === "object" && "code" in error
                      ? error.code
                      : undefined,
                  responseCode:
                    error && typeof error === "object" && "responseCode" in error
                      ? error.responseCode
                      : undefined,
                  command:
                    error && typeof error === "object" && "command" in error
                      ? error.command
                      : undefined,
                },
                "email delivery failed",
              );
              if (outcome.status !== "accepted" && isProviderWideFailure(outcome)) {
                await markProviderUnavailable();
              }
              const published = await getPublishedVerificationToken();
              if (published) {
                await db.verificationToken.deleteMany({
                  where: {
                    identifier: published.identifier,
                    token: published.token,
                  },
                });
              }
              throw error;
            } finally {
              if (typeof transport.close === "function") transport.close();
            }
          },
          server: smtp.server,
          from: smtp.from,
        }),
        createSignupProvider(smtp),
      ]
    : [],
};
