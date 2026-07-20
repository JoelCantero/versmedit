"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseLoginEmail } from "@/modules/login/schema";
import type { LoginLocale, LoginResult, LoginUiState } from "@/modules/login/types";

export interface LoginFormMessages {
  ariaLabel: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailDescription: string;
  invalidEmail: string;
  submitIdle: string;
  submitPending: string;
  sending: string;
  accepted: string;
  invalidRequest: string;
  unavailable: string;
  rateLimited: string;
}

interface LoginFormProps {
  locale: LoginLocale;
  callbackUrl: string;
  messages: LoginFormMessages;
  title?: string;
  description?: string;
  csrfToken?: string;
  fetcher?: typeof fetch;
}

export function LoginForm({
  locale,
  callbackUrl,
  messages,
  title,
  description,
  csrfToken,
  fetcher = fetch,
}: LoginFormProps) {
  const [state, setState] = useState<LoginUiState>("initial");
  const [statusMessage, setStatusMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "pending") return;

    const formData = new FormData(event.currentTarget);
    let email: string;
    try {
      email = parseLoginEmail(formData.get("email"));
    } catch {
      setState("invalidEmail");
      setStatusMessage("");
      return;
    }

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

      const trustedCallback = callbackUrl || (locale === "en" ? "/" : `/${locale}`);
      const body = new URLSearchParams({
        email,
        csrfToken: token,
        callbackUrl: trustedCallback,
        json: "true",
      });
      const response = await fetcher("/api/auth/signin/email", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const result = (await response.json()) as LoginResult;

      if (result.status === "accepted") {
        setState("accepted");
        setStatusMessage(messages.accepted);
      } else if (result.status === "invalid_request") {
        setState("invalidRequest");
        setStatusMessage(messages.invalidRequest);
      } else if (result.status === "rate_limited") {
        setState("rateLimited");
        setStatusMessage(
          messages.rateLimited.replaceAll("{seconds}", String(result.retryAfter)),
        );
      } else if (result.status === "unavailable") {
        setState("unavailable");
        setStatusMessage(messages.unavailable);
      } else {
        setState("invalidEmail");
        setStatusMessage(messages.invalidEmail);
      }
    } catch {
      setState("unavailable");
      setStatusMessage(messages.unavailable);
    }
  }

  const invalid = state === "invalidEmail";
  return (
    <Card>
      {title && (
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <h1 id="login-heading">{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <form aria-label={messages.ariaLabel} onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="login-email">{messages.emailLabel}</FieldLabel>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={messages.emailPlaceholder}
                aria-invalid={invalid}
                aria-describedby="login-email-description login-email-error"
                disabled={state === "pending"}
                required
              />
              <FieldDescription id="login-email-description">
                {messages.emailDescription}
              </FieldDescription>
              <p id="login-email-error" className="min-h-5 text-sm text-destructive">
                {invalid ? messages.invalidEmail : ""}
              </p>
            </Field>
            <Field>
              <Button type="submit" disabled={state === "pending"}>
                {state === "pending" ? messages.submitPending : messages.submitIdle}
              </Button>
            </Field>
          </FieldGroup>
          <p
            className="mt-4 min-h-12 text-sm text-muted-foreground"
            role={state === "invalidRequest" || state === "unavailable" ? "alert" : "status"}
            aria-live={state === "invalidRequest" || state === "unavailable" ? "assertive" : "polite"}
          >
            {statusMessage}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}