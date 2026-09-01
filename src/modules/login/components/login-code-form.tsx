"use client";

import { useEffect, useRef, useState } from "react";

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LOGIN_CODE_LENGTH } from "@/modules/login/code";
import type { LoginCodeResult, LoginCodeUiState } from "@/modules/login/types";

export interface LoginCodeFormMessages {
  title: string;
  description: string;
  fieldLabel: string;
  fieldDescription: string;
  submitIdle: string;
  submitPending: string;
  invalidCode: string;
  invalidRequest: string;
  unavailable: string;
  rateLimited: string;
  backToLogin: string;
}

interface LoginCodeFormProps {
  email: string;
  locale: string;
  callbackUrl: string;
  messages: LoginCodeFormMessages;
  onBack: () => void;
  csrfToken?: string;
  fetcher?: typeof fetch;
  navigate?: (destination: string) => void;
}

export function LoginCodeForm({
  email,
  locale,
  callbackUrl,
  messages,
  onBack,
  csrfToken,
  fetcher = fetch,
  navigate = (destination) => window.location.assign(destination),
}: LoginCodeFormProps) {
  const [state, setState] = useState<LoginCodeUiState>("initial");
  const [statusMessage, setStatusMessage] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "pending") return;

    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setState("pending");
    setStatusMessage("");

    try {
      let token = csrfToken;
      if (!token) {
        const csrfResponse = await fetcher("/api/auth/csrf");
        const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
        token = csrfPayload.csrfToken;
      }
      if (!token) throw new Error("missing CSRF token");

      const response = await fetcher("/api/auth/login/code", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email,
          code,
          csrfToken: token,
          callbackUrl,
          locale,
        }),
      });
      const result = (await response.json()) as LoginCodeResult;

      if (result.status === "accepted") {
        navigate(result.redirectTo);
        return;
      }
      if (result.status === "rate_limited") {
        setState("rateLimited");
        setStatusMessage(
          messages.rateLimited.replaceAll("{seconds}", String(result.retryAfter)),
        );
        return;
      }
      if (result.status === "invalid_request") {
        setState("invalidRequest");
        setStatusMessage(messages.invalidRequest);
        return;
      }
      if (result.status === "unavailable") {
        setState("unavailable");
        setStatusMessage(messages.unavailable);
        return;
      }
      setState("invalidCode");
      setStatusMessage("");
    } catch {
      setState("unavailable");
      setStatusMessage(messages.unavailable);
    }
  }

  const invalid = state === "invalidCode";
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1 id="login-code-heading" ref={headingRef} tabIndex={-1}>
            {messages.title}
          </h1>
        </CardTitle>
        <CardDescription>{messages.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form aria-labelledby="login-code-heading" onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="login-code">{messages.fieldLabel}</FieldLabel>
              <Input
                id="login-code"
                name="code"
                type="text"
                autoComplete="one-time-code"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={LOGIN_CODE_LENGTH * 4}
                className="text-center font-mono text-lg tracking-[0.3em] uppercase"
                aria-invalid={invalid}
                aria-describedby={
                  invalid
                    ? "login-code-description login-code-error"
                    : "login-code-description"
                }
                disabled={state === "pending"}
                required
              />
              <FieldDescription id="login-code-description">
                {messages.fieldDescription}
              </FieldDescription>
              <div className="min-h-5">
                {invalid ? (
                  <FieldError id="login-code-error">{messages.invalidCode}</FieldError>
                ) : null}
              </div>
            </Field>
            <Field>
              <Button type="submit" disabled={state === "pending"}>
                {state === "pending" ? messages.submitPending : messages.submitIdle}
              </Button>
              <Button type="button" variant="ghost" onClick={onBack}>
                {messages.backToLogin}
              </Button>
            </Field>
          </FieldGroup>
          <p
            className="mt-4 min-h-12 text-sm text-muted-foreground"
            role={state === "invalidRequest" || state === "unavailable" ? "alert" : "status"}
            aria-live={
              state === "invalidRequest" || state === "unavailable"
                ? "assertive"
                : "polite"
            }
          >
            {statusMessage}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
