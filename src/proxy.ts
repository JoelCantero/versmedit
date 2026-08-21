import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import {
  createRequestId,
  isCanonicalRequestOrigin,
  REQUEST_ID_HEADER,
} from "@/lib/request-context";

// next-intl locale routing via the Next.js 16 `proxy` file convention
// (constitution → Internationalization). Runs before each request: detects the
// locale (URL prefix → `NEXT_LOCALE` cookie →
// `Accept-Language`) and rewrites/redirects so English is served without a
// prefix while Spanish (`/es`) and Catalan (`/ca`) are prefixed.
const intlMiddleware = createMiddleware(routing);
const NEXT_INTL_LOCALE_HEADER = "x-next-intl-locale";

export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

function hasSecureCanonicalOrigin() {
  try {
    return new URL(process.env.NEXTAUTH_URL ?? "").protocol === "https:";
  } catch {
    return false;
  }
}

export function contentSecurityPolicy(nonce: string): string {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (process.env.NODE_ENV !== "production") scripts.push("'unsafe-eval'");

  const styles =
    process.env.NODE_ENV === "production"
      ? ["'self'", `'nonce-${nonce}'`]
      : ["'self'", "'unsafe-inline'"];

  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    `style-src ${styles.join(" ")}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" && hasSecureCanonicalOrigin()
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
}

export default function proxy(request: NextRequest) {
  // The trusted proxy boundary owns correlation IDs and CSP nonces.
  const requestId = createRequestId();
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const requiresCanonicalOrigin =
    request.nextUrl.pathname.startsWith("/api/auth/") ||
    request.nextUrl.pathname === "/api/account/deletion" ||
    request.nextUrl.pathname.startsWith("/api/account/deletion/") ||
    request.nextUrl.pathname === "/api/signup" ||
    request.nextUrl.pathname.startsWith("/api/signup/");
  if (requiresCanonicalOrigin) {
    let canonicalUrl: URL;
    try {
      canonicalUrl = new URL(process.env.NEXTAUTH_URL ?? "");
    } catch {
      return new NextResponse(null, {
        status: 503,
        headers: {
          "Content-Security-Policy": policy,
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    }
    if (!isCanonicalRequestOrigin(request, canonicalUrl)) {
      return new NextResponse(null, {
        status: 421,
        headers: {
          "Content-Security-Policy": policy,
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    }
  }

  const isResolvedLocaleRewrite =
    request.headers.has(NEXT_INTL_LOCALE_HEADER) &&
    routing.locales.some(
      (locale) =>
        request.nextUrl.pathname === `/${locale}` ||
        request.nextUrl.pathname.startsWith(`/${locale}/`),
    );

  const requestForIntl = new NextRequest(request.url, {
    headers: requestHeaders,
    method: request.method,
  });

  const response =
    request.nextUrl.pathname.startsWith("/api/") || isResolvedLocaleRewrite
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : intlMiddleware(requestForIntl);

  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Include API routes for request IDs and CSP; skip static assets and files.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
