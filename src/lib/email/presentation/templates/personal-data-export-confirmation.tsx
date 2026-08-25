import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type PersonalDataExportConfirmationRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "personalDataExportConfirmation" }
>;

export function composePersonalDataExportConfirmationBody(
  request: PersonalDataExportConfirmationRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}