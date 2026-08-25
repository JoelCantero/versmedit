import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type EmailChangedRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "emailChanged" }
>;

export function composeEmailChangedBody(
  request: EmailChangedRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}