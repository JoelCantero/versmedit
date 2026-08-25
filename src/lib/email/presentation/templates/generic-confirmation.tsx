import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type GenericConfirmationRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "genericConfirmation" }
>;

export function composeGenericConfirmationBody(
  request: GenericConfirmationRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}