import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";

import { hardenAdapter } from "@/lib/auth-adapter";
import { db } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/index";
import {
  renderEmailPresentation,
  type EmailBrand,
} from "@/lib/email/presentation";
import { getEnv } from "@/lib/env";
import { getPublishedVerificationToken } from "@/modules/login/verification-context";
import { createSignupToken } from "@/modules/signup/token";

const env = getEnv();

type SignupLocale = "en" | "es" | "ca";

export const LOGIN_CHALLENGE_MAX_AGE_SECONDS = 5 * 60;

const INTERNAL_TOKEN_MAX_AGE_SECONDS = 15 * 60;

interface VerificationRequest {
  identifier: string;
  url: string;
}

function createInternalEmailProvider({
  id,
  name,
  from,
  maxAge,
  sendVerificationRequest,
}: {
  id: "email" | "signup" | "account-deletion";
  name: "Email" | "Signup" | "Account deletion";
  from: string;
  maxAge: number;
  sendVerificationRequest: (request: VerificationRequest) => Promise<void>;
}) {
  const options = {
    maxAge,
    from,
    generateVerificationToken: () => createSignupToken().raw,
    sendVerificationRequest,
  };
  return {
    id,
    type: "email" as const,
    name,
    server: {},
    ...options,
    options,
  } as unknown as NonNullable<NextAuthOptions["providers"]>[number];
}

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

function createLoginProvider(from: string, brand: EmailBrand) {
  return createInternalEmailProvider({
    id: "email",
    name: "Email",
    from,
    maxAge: LOGIN_CHALLENGE_MAX_AGE_SECONDS,
    sendVerificationRequest: async ({ identifier, url }) => {
      const verificationUrl = new URL(url);
      const locale = parseLocaleFromCallbackUrl(
        verificationUrl.searchParams.get("callbackUrl"),
        verificationUrl.origin,
      );

      try {
        const published = await getPublishedVerificationToken();
        if (!published) throw new Error("Verification code was not published");
        const content = await renderEmailPresentation({
          variant: "loginMagicLink",
          locale,
          brand,
          actionUrl: url,
          verificationCode: published.code,
        });
        const result = await sendTransactionalEmail({
          recipient: identifier,
          locale,
          ...content,
        });
        if (result.accepted) return;
      } catch {
        // The exact token published by the concurrent adapter write is removed below.
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
      throw new Error("Email provider did not accept submission");
    },
  });
}

function createSignupProvider(from: string) {
  return createInternalEmailProvider({
    id: "signup",
    name: "Signup",
    from,
    maxAge: INTERNAL_TOKEN_MAX_AGE_SECONDS,
    sendVerificationRequest: async () => {
      throw new Error("Signup provider cannot initiate delivery");
    },
  });
}

function createAccountDeletionProvider(from: string) {
  return createInternalEmailProvider({
    id: "account-deletion",
    name: "Account deletion",
    from,
    maxAge: INTERNAL_TOKEN_MAX_AGE_SECONDS,
    sendVerificationRequest: async () => {
      throw new Error("Account deletion provider cannot initiate delivery");
    },
  });
}

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
  providers: env.MAIL.enabled
    ? [
        createLoginProvider(env.MAIL.fromEmail, env.MAIL.brand),
        createSignupProvider(env.MAIL.fromEmail),
        createAccountDeletionProvider(env.MAIL.fromEmail),
      ]
    : [],
};
