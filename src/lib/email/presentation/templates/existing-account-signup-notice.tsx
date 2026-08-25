import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type ExistingAccountSignupNoticeRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "existingAccountSignupNotice" }
>;

export function composeExistingAccountSignupNoticeBody(
  request: ExistingAccountSignupNoticeRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}