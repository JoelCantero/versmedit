import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type AccountDeletedRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "accountDeleted" }
>;

export function composeAccountDeletedBody(
  request: AccountDeletedRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}