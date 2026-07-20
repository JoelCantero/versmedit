"use server";

import "server-only";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import {
  ProfileSubmissionError,
  parseProfileFormEntries,
} from "@/lib/validation/profile-name";
import { logger } from "@/lib/logger";
import {
  getCurrentUserProfile,
  updateCurrentUserName,
} from "@/modules/account/service";
import { getSessionUserId } from "@/modules/account/session";
import {
  getAccountPathForLocale,
  getLoginPathForLocale,
} from "@/modules/login/schema";
import {
  accountLocales,
  type AccountLocale,
  type ProfileActionState,
  type ProfileValidationMessage,
} from "@/modules/account/types";

const localeSchema = z.enum(accountLocales);

function getLoginPath(locale: AccountLocale) {
  const callbackPath = getAccountPathForLocale(locale);
  return `${getLoginPathForLocale(locale)}?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

function mapValidationMessage(error: z.ZodError): ProfileValidationMessage {
  const message = error.issues[0]?.message;

  if (
    message === "required" ||
    message === "too_long" ||
    message === "invalid_characters"
  ) {
    return message;
  }

  return "invalid_submission";
}

function extractAttemptedName(entries: unknown, fallback: string) {
  if (!Array.isArray(entries)) return fallback;

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [field, value] = entry as [unknown, unknown];
    if (field === "name" && typeof value === "string") {
      return value;
    }
  }

  return fallback;
}

export async function updateProfile(
  localeInput: unknown,
  previousState: ProfileActionState,
  entries: unknown,
): Promise<ProfileActionState> {
  const locale = localeSchema.parse(localeInput);
  const session = await getServerSession(authOptions);
  const sessionUserId = getSessionUserId(session);
  if (!sessionUserId) {
    redirect(getLoginPath(locale));
  }

  const currentProfile = await getCurrentUserProfile(sessionUserId);
  const attemptedName = extractAttemptedName(entries, previousState.name);
  let normalizedName = "";

  try {
    const parsed = parseProfileFormEntries(entries);
    normalizedName = parsed.name;

    if ((currentProfile.name ?? "") === normalizedName) {
      return { status: "success", name: normalizedName, message: "saved" };
    }

    const updated = await updateCurrentUserName(sessionUserId, normalizedName);
    return {
      status: "success",
      name: updated.name ?? normalizedName,
      message: "saved",
    };
  } catch (error) {
    if (error instanceof ProfileSubmissionError) {
      return {
        status: "validation_error",
        name: error.attemptedName || attemptedName,
        field: "form",
        message: "invalid_submission",
      };
    }

    if (error instanceof z.ZodError) {
      const message = mapValidationMessage(error);
      return {
        status: "validation_error",
        name: attemptedName,
        field: message === "invalid_submission" ? "form" : "name",
        message,
      };
    }

    logger.error(
      {
        category: "account_profile_update_failed",
      },
      "account profile update failed",
    );

    return {
      status: "persistence_error",
      name: attemptedName || normalizedName || previousState.name,
      message: "save_failed",
    };
  }
}