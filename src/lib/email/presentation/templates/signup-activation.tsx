import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type SignupActivationRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "signupActivation" }
>;

export function composeSignupActivationBody(
  request: SignupActivationRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}