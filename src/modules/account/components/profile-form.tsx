"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getProfileInitials } from "@/modules/account/initials";
import type {
  AccountLocale,
  ProfileActionState,
  ProfileFormEntry,
  ProfileValidationMessage,
} from "@/modules/account/types";

export interface ProfileFormMessages {
  profileHeading: string;
  profileDescription: string;
  avatarLabel: string;
  avatarImageAlt: string;
  nameLabel: string;
  nameDescription: string;
  emailLabel: string;
  emailDescription: string;
  saveIdle: string;
  savePending: string;
  pendingAnnouncement: string;
  saved: string;
  saveFailed: string;
  required: string;
  tooLong: string;
  invalidCharacters: string;
  invalidSubmission: string;
}

interface ProfileSnapshot {
  name: string | null;
  email: string;
  image: string | null;
}

type ProfileFormAction = (
  locale: AccountLocale,
  previousState: ProfileActionState,
  entries: ProfileFormEntry[],
) => Promise<ProfileActionState>;

interface ProfileFormProps {
  locale: AccountLocale;
  initialProfile: ProfileSnapshot;
  messages: ProfileFormMessages;
  action: ProfileFormAction;
}

const subscribeToHydration = () => () => {};

function messageForValidation(
  message: ProfileValidationMessage,
  messages: ProfileFormMessages,
) {
  switch (message) {
    case "required":
      return messages.required;
    case "too_long":
      return messages.tooLong;
    case "invalid_characters":
      return messages.invalidCharacters;
    case "invalid_submission":
      return messages.invalidSubmission;
    default:
      return messages.invalidSubmission;
  }
}

export function ProfileForm({ locale, initialProfile, messages, action }: ProfileFormProps) {
  const [state, setState] = useState<ProfileActionState>({
    status: "idle",
    name: initialProfile.name ?? "",
  });
  const [draftName, setDraftName] = useState(initialProfile.name ?? "");
  const [pending, setPending] = useState(false);
  const [showImage, setShowImage] = useState(Boolean(initialProfile.image));
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  function setAvatarImageRef(image: HTMLImageElement | null) {
    if (image?.complete && image.naturalWidth === 0) {
      queueMicrotask(() => setShowImage(false));
    }
  }

  useEffect(() => {
    if (pending) return;

    if (state.status === "validation_error" && state.field === "name") {
      nameInputRef.current?.focus();
    }
    if (state.status === "persistence_error") {
      submitButtonRef.current?.focus();
    }
  }, [pending, state]);

  const initials = useMemo(
    () =>
      getProfileInitials({
        name: draftName,
        email: initialProfile.email,
      }),
    [draftName, initialProfile.email],
  );

  const nameErrorMessage =
    state.status === "validation_error" && state.field === "name"
      ? messageForValidation(state.message, messages)
      : "";

  const formErrorMessage =
    state.status === "validation_error" && state.field === "form"
      ? messageForValidation(state.message, messages)
      : "";

  const statusMessage = (() => {
    if (pending) return messages.pendingAnnouncement;
    if (state.status === "success") return messages.saved;
    if (state.status === "persistence_error") return messages.saveFailed;
    if (state.status === "validation_error" && state.field === "form") {
      return messageForValidation(state.message, messages);
    }
    return "";
  })();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    const entries: ProfileFormEntry[] = [];
    entries.push(["name", draftName]);

    const previousState: ProfileActionState = {
      status: "idle",
      name: draftName,
    };
    try {
      const nextState = await action(locale, previousState, entries);
      setState(nextState);
      setDraftName(nextState.name);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="min-w-0 space-y-6" aria-labelledby="account-profile-heading">
      <header className="space-y-2">
        <h2
          id="account-profile-heading"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {messages.profileHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{messages.profileDescription}</p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <div className="flex items-center gap-3">
              <Avatar>
                {showImage && initialProfile.image ? (
                  <AvatarImage
                    ref={setAvatarImageRef}
                    src={initialProfile.image}
                    alt={messages.avatarImageAlt}
                    onError={() => setShowImage(false)}
                  />
                ) : (
                  <AvatarFallback aria-label={messages.avatarLabel}>{initials}</AvatarFallback>
                )}
              </Avatar>
            </div>
          </Field>

          <Field data-invalid={Boolean(nameErrorMessage) || undefined}>
            <FieldLabel htmlFor="account-name">{messages.nameLabel}</FieldLabel>
            <Input
              ref={nameInputRef}
              id="account-name"
              name="name"
              autoComplete="name"
              maxLength={80}
              value={draftName}
              onChange={(event) => setDraftName(event.currentTarget.value)}
              aria-invalid={Boolean(nameErrorMessage)}
              aria-describedby="account-name-description account-name-error"
              disabled={!hydrated || pending}
              required
            />
            <FieldDescription id="account-name-description">
              {messages.nameDescription}
            </FieldDescription>
            <p id="account-name-error" className="min-h-5 text-sm text-destructive" role="alert">
              {nameErrorMessage}
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="account-email">{messages.emailLabel}</FieldLabel>
            <Input
              id="account-email"
              type="email"
              autoComplete="email"
              value={initialProfile.email}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              aria-describedby="account-email-description"
              className="break-all"
            />
            <FieldDescription id="account-email-description">
              {messages.emailDescription}
            </FieldDescription>
          </Field>

          <Field>
            <Button ref={submitButtonRef} type="submit" disabled={!hydrated || pending}>
              {pending ? messages.savePending : messages.saveIdle}
            </Button>
          </Field>
        </FieldGroup>

        <p
          className="mt-4 min-h-12 text-sm text-muted-foreground"
          id="account-form-status"
          role={
            state.status === "validation_error" || state.status === "persistence_error"
              ? "alert"
              : "status"
          }
          aria-live={
            state.status === "validation_error" || state.status === "persistence_error"
              ? "assertive"
              : "polite"
          }
        >
          {formErrorMessage || statusMessage}
        </p>
      </form>
    </section>
  );
}