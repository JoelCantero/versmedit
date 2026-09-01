export const EMAIL_LOCALES = ["en", "es", "ca"] as const;

export const EMAIL_VARIANTS = [
  "loginMagicLink",
  "signupActivation",
  "existingAccountSignupNotice",
  "accountDeletionReauthentication",
  "accountSecurityReauthentication",
  "personalDataExportConfirmation",
  "personalDataExportReady",
  "accountDeleted",
  "emailChangeRequested",
  "emailChanged",
  "securityAlert",
  "genericConfirmation",
] as const;

type EmailVariantName = (typeof EMAIL_VARIANTS)[number];

type EmailVariantDefinition = {
  readonly classification: "operational" | "preview-only";
  readonly actionMode: "credential" | "credential-free" | "fictional" | "none";
  readonly valueKeys: readonly string[];
};

export const EMAIL_VARIANT_DEFINITIONS = {
  loginMagicLink: {
    classification: "operational",
    actionMode: "credential",
    valueKeys: ["actionUrl", "verificationCode"],
  },
  signupActivation: {
    classification: "operational",
    actionMode: "credential",
    valueKeys: ["actionUrl"],
  },
  existingAccountSignupNotice: {
    classification: "operational",
    actionMode: "credential-free",
    valueKeys: ["actionUrl"],
  },
  accountDeletionReauthentication: {
    classification: "operational",
    actionMode: "credential",
    valueKeys: ["actionUrl"],
  },
  accountSecurityReauthentication: {
    classification: "operational",
    actionMode: "credential",
    valueKeys: ["actionUrl"],
  },
  personalDataExportConfirmation: {
    classification: "operational",
    actionMode: "credential",
    valueKeys: ["actionUrl"],
  },
  personalDataExportReady: {
    classification: "preview-only",
    actionMode: "fictional",
    valueKeys: ["actionUrl"],
  },
  accountDeleted: {
    classification: "preview-only",
    actionMode: "none",
    valueKeys: [],
  },
  emailChangeRequested: {
    classification: "preview-only",
    actionMode: "fictional",
    valueKeys: ["actionUrl", "newEmail"],
  },
  emailChanged: {
    classification: "preview-only",
    actionMode: "none",
    valueKeys: ["newEmail"],
  },
  securityAlert: {
    classification: "preview-only",
    actionMode: "fictional",
    valueKeys: ["actionUrl", "occurredAt"],
  },
  genericConfirmation: {
    classification: "preview-only",
    actionMode: "fictional",
    valueKeys: ["actionUrl", "reference"],
  },
} as const satisfies Record<EmailVariantName, EmailVariantDefinition>;

export const EMAIL_POLICY_PATHS = {
  terms: "/terms",
  privacy: "/privacy",
} as const;

export const EMAIL_PREVIEW_HOSTS = [
  "example.com",
  "example.org",
  "example.net",
] as const;
