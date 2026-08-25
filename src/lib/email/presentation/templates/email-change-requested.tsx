import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type EmailChangeRequestedRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "emailChangeRequested" }
>;

export function composeEmailChangeRequestedBody(
  request: EmailChangeRequestedRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}