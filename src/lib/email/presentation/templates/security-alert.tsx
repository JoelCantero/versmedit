import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type SecurityAlertRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "securityAlert" }
>;

export function composeSecurityAlertBody(
  request: SecurityAlertRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}