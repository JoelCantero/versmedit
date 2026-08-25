import type {
  EmailPresentationRequest,
  LocalizedEmailCopy,
} from "../types";

type PersonalDataExportReadyRequest = Extract<
  EmailPresentationRequest,
  { readonly variant: "personalDataExportReady" }
>;

export function composePersonalDataExportReadyBody(
  request: PersonalDataExportReadyRequest,
  localizedCopy: LocalizedEmailCopy,
) {
  return Object.freeze({ request, localizedCopy });
}