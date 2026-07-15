import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Wires next-intl's request config (src/i18n/request.ts) into the build.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Baseline security headers applied to every response (constitution Principle X).
// CSP and request-specific headers are applied in src/proxy.ts. HSTS is safe in
// dev because browsers ignore it over plain HTTP.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Emit a minimal standalone server bundle for small Docker images.
  output: "standalone",
  // Keep Pino (and its optional pretty transport) external at runtime instead of
  // bundling them: Pino resolves transports/workers via dynamic require, which the
  // bundler cannot trace and would break in the standalone output.
  serverExternalPackages: ["pino", "pino-pretty"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
