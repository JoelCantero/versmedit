import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type AccountDeletionReauthenticationRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "accountDeletionReauthentication" }
>;

export function composeAccountDeletionReauthenticationBody(
  request: AccountDeletionReauthenticationRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}