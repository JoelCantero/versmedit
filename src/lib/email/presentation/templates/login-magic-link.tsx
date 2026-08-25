import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type LoginMagicLinkRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "loginMagicLink" }
>;

export function composeLoginMagicLinkBody(
  request: LoginMagicLinkRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}