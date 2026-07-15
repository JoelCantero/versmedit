import { isIP } from "node:net";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

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