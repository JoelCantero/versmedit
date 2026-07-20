export const accountLocales = ["en", "es", "ca"] as const;

export type AccountLocale = (typeof accountLocales)[number];

export type ProfileFormEntry = readonly [name: string, value: string];

export type ProfileValidationMessage =
  | "required"
  | "too_long"
  | "invalid_characters"
  | "invalid_submission";

export type ProfileActionState =
  | { status: "idle"; name: string }
  | { status: "success"; name: string; message: "saved" }
  | {
      status: "validation_error";
      name: string;
      field: "name" | "form";
      message: ProfileValidationMessage;
    }
  | { status: "persistence_error"; name: string; message: "save_failed" };