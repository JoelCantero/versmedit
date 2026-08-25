export {
  EmailBrandValidationError,
  validateEmailBrand,
} from "./brand";
export {
  EMAIL_LOCALES,
  EMAIL_VARIANT_DEFINITIONS,
  EMAIL_VARIANTS,
} from "./constants";
export {
  OPERATIONAL_EMAIL_VARIANTS,
  PREVIEW_ONLY_EMAIL_VARIANTS,
  type OperationalEmailVariant,
  type PreviewOnlyEmailVariant,
} from "./catalog";
export {
  EmailPresentationError,
  renderEmailPresentation,
  validateEmailPresentationRequest,
  validateLocalizedEmailCopy,
} from "./render";
export type {
  EmailBrand,
  EmailLocale,
  EmailPresentationErrorCode,
  EmailPresentationRequest,
  EmailVariant,
  EmailVariantValues,
  LocalizedEmailCopy,
  RenderedEmailContent,
} from "./types";