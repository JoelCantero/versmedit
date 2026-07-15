import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import {
  createRequestId,
  REQUEST_ID_HEADER,
} from "@/lib/request-context";

// next-intl locale routing via the Next.js 16 `proxy` file convention
// (constitution → Internationalization). Runs before each request: detects the
// locale (URL prefix → `NEXT_LOCALE` cookie →
// `Accept-Language`) and rewrites/redirects so English is served without a
// prefix while Spanish (`/es`) and Catalan (`/ca`) are prefixed.
const intlMiddleware = createMiddleware(routing);
const NEXT_INTL_LOCALE_HEADER = "x-next-intl-locale";

function effectivePort(protocol: string, port: string): string {
  if (port) return port;
  return protocol === "https:" ? "443" : "80";
}

function isCanonicalAuthHost(requestHost: string | null, canonicalUrl: URL): boolean {
  if (
    !requestHost ||
    requestHost !== requestHost.trim() ||
    /[\s@/?#,\\]/.test(requestHost) ||
    !/^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/.test(requestHost)
  ) {
    return false;
  }

  try {
    const received = new URL(`${canonicalUrl.protocol}//${requestHost}`);
    if (received.port && Number(received.port) > 65_535) return false;
    return (
      received.hostname.toLowerCase() === canonicalUrl.hostname.toLowerCase() &&
      effectivePort(received.protocol, received.port) ===
        effectivePort(canonicalUrl.protocol, canonicalUrl.port)
    );
  } catch {
    return false;
  }
}

export function createNonce(): string {
  return btoa(crypto.randomUUID());
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
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production"
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

  if (request.nextUrl.pathname.startsWith("/api/auth/")) {
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
    const forwardedHost = process.env.TRUST_PROXY_HEADERS === "true"
      ? request.headers.get("x-forwarded-host")
      : undefined;
    const requestHost = forwardedHost || request.headers.get("host");
    if (!isCanonicalAuthHost(requestHost, canonicalUrl)) {
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

  const response =
    request.nextUrl.pathname.startsWith("/api/") || isResolvedLocaleRewrite
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : intlMiddleware(request);

  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Include API routes for request IDs and CSP; skip static assets and files.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
