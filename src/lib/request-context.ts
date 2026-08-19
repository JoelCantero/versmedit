import { isIP } from "node:net";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const HOST_PATTERN = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/;

export const REQUEST_ID_HEADER = "x-request-id";

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function getRequestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  return incoming && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : createRequestId();
}

export function getClientIdentifier(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "untrusted-direct-client";

  // Enable only when the ingress guarantees that clients cannot reach the app
  // without Cloudflare and overwrites this header on every request.
  const edgeAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (edgeAddress && isIP(edgeAddress) !== 0) {
    return edgeAddress.toLowerCase();
  }

  return "unknown-edge-client";
}

function effectivePort(protocol: string, port: string): string {
  if (port) return port;
  return protocol === "https:" ? "443" : "80";
}

function getCloudflareProtocol(request: Request): string | null {
  const value = request.headers.get("cf-visitor");
  if (!value) return null;

  try {
    const scheme = JSON.parse(value).scheme;
    return scheme === "http" || scheme === "https" ? scheme : null;
  } catch {
    return null;
  }
}

export function isCanonicalRequestOrigin(
  request: Request,
  canonicalUrl: URL,
  trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === "true",
): boolean {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  const forwardedHost = trustProxyHeaders
    ? request.headers.get("x-forwarded-host")
    : null;
  const forwardedProtocol = trustProxyHeaders
    ? getCloudflareProtocol(request) ?? request.headers.get("x-forwarded-proto")
    : null;
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;

  if (
    host !== host.trim() ||
    !HOST_PATTERN.test(host) ||
    (protocol !== "http:" && protocol !== "https:")
  ) {
    return false;
  }

  try {
    const received = new URL(`${protocol}//${host}`);
    if (received.port && Number(received.port) > 65_535) return false;
    return (
      received.protocol === canonicalUrl.protocol &&
      received.hostname.toLowerCase() === canonicalUrl.hostname.toLowerCase() &&
      effectivePort(received.protocol, received.port) ===
        effectivePort(canonicalUrl.protocol, canonicalUrl.port)
    );
  } catch {
    return false;
  }
}