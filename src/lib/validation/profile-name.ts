import { z } from "zod";

import type { ProfileFormEntry } from "@/modules/account/types";

const PROFILE_NAME_ALLOWED_PATTERN = /^[\p{L}\s'’-]+$/u;

export const PROFILE_NAME_MAX_LENGTH = 80;

const profileNameInputSchema = z.string();

export const profileNameSchema = profileNameInputSchema
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "required")
      .max(PROFILE_NAME_MAX_LENGTH, "too_long")
      .regex(PROFILE_NAME_ALLOWED_PATTERN, "invalid_characters"),
  );

const profileFormEntriesSchema = z.array(z.tuple([z.string(), z.string()]));

const allowedProfileFieldNames = new Set(["name"]);

export class ProfileSubmissionError extends Error {
  constructor(
    public readonly code: "invalid_submission",
    public readonly attemptedName: string,
  ) {
    super(code);
    this.name = "ProfileSubmissionError";
  }
}

function firstNameLikeValue(entries: readonly ProfileFormEntry[]) {
  for (const [field, value] of entries) {
    if (field === "name") return value;
  }
  return "";
}

export function parseProfileName(value: unknown) {
  return profileNameSchema.parse(value);
}

export function parseProfileFormEntries(entries: unknown) {
  const parsedEntries = profileFormEntriesSchema.parse(entries) as ProfileFormEntry[];
  const attemptedName = firstNameLikeValue(parsedEntries);
  const seen = new Set<string>();

  for (const [field] of parsedEntries) {
    if (!allowedProfileFieldNames.has(field) || seen.has(field)) {
      throw new ProfileSubmissionError("invalid_submission", attemptedName);
    }
    seen.add(field);
  }

  if (!seen.has("name")) {
    throw new ProfileSubmissionError("invalid_submission", attemptedName);
  }

  return {
    name: parseProfileName(attemptedName),
    attemptedName,
  };
}