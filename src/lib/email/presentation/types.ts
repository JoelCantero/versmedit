import type { EMAIL_LOCALES, EMAIL_VARIANTS } from "./constants";

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export type EmailVariant = (typeof EMAIL_VARIANTS)[number];

export type EmailBrand = {
  readonly productName: string;
  readonly canonicalOrigin: string;
  readonly primaryColor: string;
  readonly actionForeground: "#000000" | "#FFFFFF";
  readonly supportEmail: string;
  readonly logoUrl: string | null;
};

type SharedLocalizedEmailCopy = {
  readonly subject: string;
  readonly previewText: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly supportLabel: string;
  readonly termsLabel: string;
  readonly privacyLabel: string;
  readonly legalLabel: string;
};

export type ActionLocalizedEmailCopy = SharedLocalizedEmailCopy & {
  readonly actionLabel: string;
  readonly fallbackInstruction: string;
};

export type InformationalLocalizedEmailCopy = SharedLocalizedEmailCopy & {
  readonly actionLabel?: never;
  readonly fallbackInstruction?: never;
};

export type LocalizedEmailCopy =
  | ActionLocalizedEmailCopy
  | InformationalLocalizedEmailCopy;

export type EmailVariantValues = {
  readonly loginMagicLink: {
    readonly actionUrl: string;
    readonly verificationCode: string;
  };
  readonly signupActivation: { readonly actionUrl: string };
  readonly existingAccountSignupNotice: { readonly actionUrl: string };
  readonly accountDeletionReauthentication: { readonly actionUrl: string };
  readonly accountSecurityReauthentication: { readonly actionUrl: string };
  readonly personalDataExportConfirmation: { readonly actionUrl: string };
  readonly personalDataExportReady: { readonly actionUrl: string };
  readonly accountDeleted: Record<never, never>;
  readonly emailChangeRequested: {
    readonly actionUrl: string;
    readonly newEmail: string;
  };
  readonly emailChanged: { readonly newEmail: string };
  readonly securityAlert: {
    readonly actionUrl: string;
    readonly occurredAt: string;
  };
  readonly genericConfirmation: {
    readonly actionUrl: string;
    readonly reference: string;
  };
};

type EmailPresentationRequestFor<Variant extends EmailVariant> = {
  readonly variant: Variant;
  readonly locale: EmailLocale;
  readonly brand: EmailBrand;
} & EmailVariantValues[Variant];

export type EmailPresentationRequest = {
  readonly [Variant in EmailVariant]: EmailPresentationRequestFor<Variant>;
}[EmailVariant];

export type RenderedEmailContent = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

export type EmailPresentationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_BRAND"
  | "INVALID_CATALOGUE"
  | "RENDER_FAILED";