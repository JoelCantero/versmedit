"use client";

import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { signupClientSchema } from "@/modules/signup/schema";
import type { SignupLocale, SignupPublicResult } from "@/modules/signup/types";

type SignupUiState =
  | "initial"
  | "pending"
  | "accepted"
  | "invalidRequest"
  | "rateLimited"
  | "unavailable";

type SignupField = "name" | "email" | "policyAccepted";
type SignupErrors = Partial<Record<SignupField, string>>;

export type SignupRecoveryState =
  | "invalid_link"
  | "session_conflict"
  | "session_failed";

export interface SignupFormMessages {
  ariaLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  nameDescription: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailDescription: string;
  policyLabelPrefix: string;
  policyTerms: string;
  policyAnd: string;
  policyPrivacy: string;
  policyDescription: string;
  invalidNameRequired: string;
  invalidNameTooLong: string;
  invalidNameCharacters: string;
  invalidEmail: string;
  invalidPolicy: string;
  invalidRequest: string;
  submitIdle: string;
  submitPending: string;
  sending: string;
  accepted: string;
  unavailable: string;
  rateLimited: string;
  loginPrompt: string;
  login: string;
  invalidLinkTitle: string;
  invalidLinkDescription: string;
  invalidLinkAction: string;
  sessionConflictTitle: string;
  sessionConflictDescription: string;
  sessionConflictAction: string;
  sessionFailedTitle: string;
  sessionFailedDescription: string;
  sessionFailedAction: string;
}

interface SignupFormProps {
  locale: SignupLocale;
  policyDestinations: { terms: string; privacy: string };
  messages: SignupFormMessages;
  title?: string;
  description?: string;
  csrfToken?: string;
  fetcher?: typeof fetch;
  recoveryState?: SignupRecoveryState;
  loginPath?: string;
}

export function SignupForm({
  locale,
  policyDestinations,
  messages,
  title,
  description,
  csrfToken,
  fetcher = fetch,
  recoveryState,
  loginPath = "/login",
}: SignupFormProps) {
  const [state, setState] = useState<SignupUiState>("initial");
  const [errors, setErrors] = useState<SignupErrors>({});
  const [statusMessage, setStatusMessage] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const policyRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<SignupField | null>(null);

  useEffect(() => {
    const field = pendingFocusRef.current;
    if (!field || state === "pending") return;
    pendingFocusRef.current = null;
    const target = {
      name: nameRef,
      email: emailRef,
      policyAccepted: policyRef,
    }[field];
    target.current?.focus();
  }, [errors, state]);

  if (recoveryState) {
    const signupPath = "/signup";
    const localizedSignupPath =
      locale === "en" ? signupPath : `/${locale}${signupPath}`;
    const recovery = {
      invalid_link: {
        title: messages.invalidLinkTitle,
        description: messages.invalidLinkDescription,
        action: messages.invalidLinkAction,
        href: signupPath,
      },
      session_conflict: {
        title: messages.sessionConflictTitle,
        description: messages.sessionConflictDescription,
        action: messages.sessionConflictAction,
        href: `/api/auth/signout?callbackUrl=${encodeURIComponent(localizedSignupPath)}`,
        authAction: true,
      },
      session_failed: {
        title: messages.sessionFailedTitle,
        description: messages.sessionFailedDescription,
        action: messages.sessionFailedAction,
        href: loginPath,
      },
    }[recoveryState];

    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <h1>{recovery.title}</h1>
          </CardTitle>
          <CardDescription>{recovery.description}</CardDescription>
        </CardHeader>
        <CardContent role="alert">
            {"authAction" in recovery ? (
              <a
                href={recovery.href}
                className={buttonVariants({ className: "w-full" })}
              >
                {recovery.action}
              </a>
            ) : (
              <Link
                href={recovery.href}
                className={buttonVariants({ className: "w-full" })}
              >
                {recovery.action}
              </Link>
            )}
        </CardContent>
      </Card>
    );
  }

  function focusField(field: SignupField) {
    pendingFocusRef.current = field;
  }

  function nameError(code: string) {
    if (code === "required") return messages.invalidNameRequired;
    if (code === "too_long") return messages.invalidNameTooLong;
    return messages.invalidNameCharacters;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "pending") return;

    const formData = new FormData(event.currentTarget);
    const parsed = signupClientSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      policyAccepted: formData.get("policyAccepted") === "on",
    });

    if (!parsed.success) {
      const nextErrors: SignupErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name" && !nextErrors.name) {
          nextErrors.name = nameError(issue.message);
        } else if (field === "email" && !nextErrors.email) {
          nextErrors.email = messages.invalidEmail;
        } else if (field === "policyAccepted" && !nextErrors.policyAccepted) {
          nextErrors.policyAccepted = messages.invalidPolicy;
        }
      }
      setErrors(nextErrors);
      setStatusMessage("");
      const firstInvalid = (["name", "email", "policyAccepted"] as const).find(
        (field) => nextErrors[field],
      );
      if (firstInvalid) focusField(firstInvalid);
      return;
    }

    setErrors({});
    setState("pending");
    setStatusMessage(messages.sending);

    try {
      let token = csrfToken;
      if (!token) {
        const csrfResponse = await fetcher("/api/auth/csrf");
        const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
        token = csrfPayload.csrfToken;
      }
      if (!token) throw new Error("missing CSRF token");

      const response = await fetcher("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          locale,
          csrfToken: token,
        }),
      });
      const result = (await response.json()) as SignupPublicResult;

      if (result.status === "accepted") {
        setState("accepted");
        setStatusMessage(messages.accepted);
      } else if (result.status === "invalid") {
        const nextErrors = {
          [result.field]:
            result.field === "name"
              ? messages.invalidNameCharacters
              : result.field === "email"
                ? messages.invalidEmail
                : messages.invalidPolicy,
        };
        setErrors(nextErrors);
        setState("initial");
        setStatusMessage("");
        focusField(result.field);
      } else if (result.status === "rate_limited") {
        setState("rateLimited");
        setStatusMessage(
          messages.rateLimited.replaceAll("{seconds}", String(result.retryAfter)),
        );
      } else if (result.status === "unavailable") {
        setState("unavailable");
        setStatusMessage(messages.unavailable);
      } else {
        setState("invalidRequest");
        setStatusMessage(messages.invalidRequest);
      }
    } catch {
      setState("unavailable");
      setStatusMessage(messages.unavailable);
    }
  }

  const pending = state === "pending";
  const urgent = state === "invalidRequest" || state === "unavailable";

  return (
    <Card>
      {title && (
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <h1 id="signup-heading">{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <form aria-label={messages.ariaLabel} onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name) || undefined} data-disabled={pending || undefined}>
              <FieldLabel htmlFor="signup-name">{messages.nameLabel}</FieldLabel>
              <Input
                ref={nameRef}
                id="signup-name"
                name="name"
                autoComplete="name"
                placeholder={messages.namePlaceholder}
                aria-invalid={Boolean(errors.name)}
                aria-describedby="signup-name-description signup-name-error"
                disabled={pending}
                required
              />
              <FieldDescription id="signup-name-description">
                {messages.nameDescription}
              </FieldDescription>
              <p
                id="signup-name-error"
                className="min-h-5 text-sm text-destructive"
                role={errors.name ? "alert" : undefined}
              >
                {errors.name ?? ""}
              </p>
            </Field>

            <Field data-invalid={Boolean(errors.email) || undefined} data-disabled={pending || undefined}>
              <FieldLabel htmlFor="signup-email">{messages.emailLabel}</FieldLabel>
              <Input
                ref={emailRef}
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={messages.emailPlaceholder}
                aria-invalid={Boolean(errors.email)}
                aria-describedby="signup-email-description signup-email-error"
                disabled={pending}
                required
              />
              <FieldDescription id="signup-email-description">
                {messages.emailDescription}
              </FieldDescription>
              <p
                id="signup-email-error"
                className="min-h-5 text-sm text-destructive"
                role={errors.email ? "alert" : undefined}
              >
                {errors.email ?? ""}
              </p>
            </Field>

            <Field
              orientation="horizontal"
              data-invalid={Boolean(errors.policyAccepted) || undefined}
              data-disabled={pending || undefined}
            >
              <input
                ref={policyRef}
                id="signup-policy"
                name="policyAccepted"
                type="checkbox"
                className="mt-0.5 size-6 shrink-0 accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-invalid={Boolean(errors.policyAccepted)}
                aria-describedby="signup-policy-description signup-policy-error"
                disabled={pending}
                required
              />
              <FieldContent>
                <FieldLabel htmlFor="signup-policy" className="flex-wrap">
                  <span>
                    {messages.policyLabelPrefix}{" "}
                    <Link href={policyDestinations.terms}>{messages.policyTerms}</Link>{" "}
                    {messages.policyAnd}{" "}
                    <Link href={policyDestinations.privacy}>{messages.policyPrivacy}</Link>
                  </span>
                </FieldLabel>
                <FieldDescription id="signup-policy-description">
                  {messages.policyDescription}
                </FieldDescription>
                <p
                  id="signup-policy-error"
                  className="min-h-5 text-sm text-destructive"
                  role={errors.policyAccepted ? "alert" : undefined}
                >
                  {errors.policyAccepted ?? ""}
                </p>
              </FieldContent>
            </Field>

            <Field data-disabled={pending || undefined}>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? messages.submitPending : messages.submitIdle}
              </Button>
            </Field>
          </FieldGroup>
          <p
            className="mt-4 min-h-12 text-sm text-muted-foreground"
            role={urgent ? "alert" : "status"}
            aria-live={urgent ? "assertive" : "polite"}
          >
            {statusMessage}
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {messages.loginPrompt}{" "}
          <Link
            href={loginPath}
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            {messages.login}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}