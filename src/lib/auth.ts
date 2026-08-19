import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";

import { hardenAdapter } from "@/lib/auth-adapter";
import { db } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/index";
import { getEnv } from "@/lib/env";
import { getPublishedVerificationToken } from "@/modules/login/verification-context";
import { createSignupToken } from "@/modules/signup/token";

const env = getEnv();
const projectName = env.PROJECT_NAME;

type SignupLocale = "en" | "es" | "ca";

interface VerificationRequest {
  identifier: string;
  url: string;
}

function createInternalEmailProvider({
  id,
  name,
  from,
  sendVerificationRequest,
}: {
  id: "email" | "signup";
  name: "Email" | "Signup";
  from: string;
  sendVerificationRequest: (request: VerificationRequest) => Promise<void>;
}) {
  const options = {
    maxAge: 15 * 60,
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createLoginProvider(from: string) {
  return createInternalEmailProvider({
    id: "email",
    name: "Email",
    from,
    sendVerificationRequest: async ({ identifier, url }) => {
      const verificationUrl = new URL(url);
      const locale = parseLocaleFromCallbackUrl(
        verificationUrl.searchParams.get("callbackUrl"),
        verificationUrl.origin,
      );
      const copy = emailCopy[locale];

      try {
        const result = await sendTransactionalEmail({
          recipient: identifier,
          locale,
          subject: copy.subject.replaceAll("{projectName}", projectName),
          text: `${copy.text}: ${url}`,
          html: `<p>${escapeHtml(copy.text)}:</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
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
    sendVerificationRequest: async () => {
      throw new Error("Signup provider cannot initiate delivery");
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
        createLoginProvider(env.MAIL.fromEmail),
        createSignupProvider(env.MAIL.fromEmail),
      ]
    : [],
};
