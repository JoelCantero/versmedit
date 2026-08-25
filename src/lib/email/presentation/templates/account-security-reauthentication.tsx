import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type AccountSecurityReauthenticationRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "accountSecurityReauthentication" }
>;

export function composeAccountSecurityReauthenticationBody(
  request: AccountSecurityReauthenticationRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}