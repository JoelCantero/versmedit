import { randomBytes } from "node:crypto";

export function createSignupToken() {
  return { raw: randomBytes(32).toString("base64url") };
}