"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldXIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AccountLocale } from "@/modules/account/types";
import type { SessionListItem } from "@/modules/account/security/types";

export interface SecuritySessionDialogMessages {
  closeLabel: string;
  cancel: string;
  close: string;
  title: string;
  description: string;
  endSelected: string;
  nextRequest: string;
  keepOthers: string;
  confirm: string;
  startedAt: string;
  expiresAt: string;
  unavailable: string;
  revoking: string;
  refreshing: string;
  reauthenticationTitle: string;
  reauthenticationDescription: string;
  sendLink: string;
  sent: string;
  sendingLink: string;
  recovering: string;
  sendFailed: string;
  rateLimited: string;
  revocationFailed: string;
  refreshFailed: string;
  bulk: {
    title: string;
    description: string;
    endOthers: string;
    includeNew: string;
    keepCurrent: string;
    confirm: string;
  };
  revokingOtherSessions: string;
}

type SecuritySessionRevocationRequest =
  | {
      csrfToken: string;
      locale: AccountLocale;
      confirmation: "revoke_session";
      sessionId: string;
    }
  | {
      csrfToken: string;
      locale: AccountLocale;
      confirmation: "revoke_other_sessions";
    };

type SecuritySessionRevocationResponse =
  | { status: "completed" }
  | { status: "reauthentication_required" }
  | { status: "revocation_failed" }
  | { status: "unauthenticated"; redirectTo?: string };

type SecuritySessionReauthenticationRequest = {
  csrfToken: string;
  locale: AccountLocale;
};

type SecuritySessionReauthenticationResponse =
  | { status: "sent" }
  | { status: "rate_limited"; retryAfter?: number }
  | { status: "unavailable" }
  | { status: "unauthenticated"; redirectTo?: string };

interface SecuritySessionDialogProps {
  mode?: "individual" | "bulk";
  locale: AccountLocale;
  session: SessionListItem;
  triggerLabel: string;
  messages: SecuritySessionDialogMessages;
  csrfToken?: string;
  requestRevocation?: (
    request: SecuritySessionRevocationRequest,
  ) => Promise<SecuritySessionRevocationResponse>;
  requestReauthentication?: (
    request: SecuritySessionReauthenticationRequest,
  ) => Promise<SecuritySessionReauthenticationResponse>;
  refresh?: () => void | Promise<void>;
  navigate?: (path: string) => void | Promise<void>;
}

type DialogState =
  | "closed"
  | "reviewing"
  | "revoking"
  | "refreshing"
  | "reauthentication_required"
  | "sending_reauthentication"
  | "reauthentication_sent"
  | "reauthentication_rate_limited"
  | "reauthentication_error"
  | "revocation_error"
  | "refresh_error"
  | "recovering";

function replacePlaceholder(template: string, name: string, value: string) {
  return template.replace(`{${name}}`, value);
}

export function formatSecuritySessionDate(
  locale: AccountLocale,
  value: string,
) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function SecuritySessionTimestamp({
  kind,
  locale,
  template,
  unavailable,
  value,
}: {
  kind: "started" | "expires";
  locale: AccountLocale;
  template: string;
  unavailable: string;
  value: string | null;
}) {
  const [before = "", after = ""] = template.split("{date}");

  return (
    <p className="min-w-0 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
      {before}
      {value ? (
        <time data-kind={kind} dateTime={value}>
          {formatSecuritySessionDate(locale, value)}
        </time>
      ) : (
        unavailable
      )}
      {after}
    </p>
  );
}

async function getDefaultCsrfToken() {
  const response = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { csrfToken?: unknown }
    | null;
  if (!response.ok || typeof payload?.csrfToken !== "string" || !payload.csrfToken) {
    throw new Error("missing CSRF token");
  }
  return payload.csrfToken;
}

async function defaultRevocationClient(
  request: SecuritySessionRevocationRequest,
): Promise<SecuritySessionRevocationResponse> {
  const endpoint =
    request.confirmation === "revoke_other_sessions"
      ? "/api/account/security/sessions/revoke-others"
      : "/api/account/security/sessions/revoke";
  const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  const payload = (await response.json().catch(() => null)) as
    | { status?: unknown; redirectTo?: unknown }
    | null;

  if (payload?.status === "completed") return { status: "completed" };
  if (payload?.status === "reauthentication_required") {
    return { status: "reauthentication_required" };
  }
  if (
    payload?.status === "unauthenticated" &&
    typeof payload.redirectTo === "string"
  ) {
    return { status: "unauthenticated", redirectTo: payload.redirectTo };
  }
  return { status: "revocation_failed" };
}

async function defaultReauthenticationClient(
  request: SecuritySessionReauthenticationRequest,
): Promise<SecuritySessionReauthenticationResponse> {
  const response = await fetch("/api/account/security/reauthenticate", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = (await response.json().catch(() => null)) as
    | { status?: unknown }
    | null;

  if (response.status === 202 && payload?.status === "sent") {
    return { status: "sent" };
  }
  if (response.status === 429 && payload?.status === "rate_limited") {
    return { status: "rate_limited" };
  }
  if (response.status === 401 && payload?.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  return { status: "unavailable" };
}

function getSecurityPath(locale: AccountLocale) {
  return locale === "en" ? "/account/security" : `/${locale}/account/security`;
}

function getSecurityLoginPath(locale: AccountLocale) {
  const loginPath = locale === "en" ? "/login" : `/${locale}/login`;
  return `${loginPath}?callbackUrl=${encodeURIComponent(getSecurityPath(locale))}`;
}

export function SecuritySessionDialog({
  mode = "individual",
  locale,
  session,
  triggerLabel,
  messages,
  csrfToken,
  requestRevocation = defaultRevocationClient,
  requestReauthentication = defaultReauthenticationClient,
  refresh,
  navigate,
}: SecuritySessionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState>("closed");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const inFlightRef = useRef(false);
  const focusListHeadingOnCloseRef = useRef(false);
  const pending =
    state === "revoking" ||
    state === "refreshing" ||
    state === "sending_reauthentication" ||
    state === "recovering";
  const bulk = mode === "bulk";
  const refreshAuthoritativeList = refresh ?? (() => router.refresh());
  const navigateTo = navigate ?? ((path: string) => router.push(path));

  function getFinalFocus() {
    if (focusListHeadingOnCloseRef.current) {
      focusListHeadingOnCloseRef.current = false;
      return document.getElementById("active-sessions-heading");
    }
    return triggerRef.current;
  }

  useEffect(
    () => () => {
      if (focusListHeadingOnCloseRef.current) {
        document.getElementById("active-sessions-heading")?.focus();
      }
    },
  );

  useEffect(() => {
    if (
      state !== "reauthentication_required" &&
      state !== "reauthentication_rate_limited" &&
      state !== "reauthentication_error" &&
      state !== "revocation_error" &&
      state !== "refresh_error"
    ) {
      if (state === "reauthentication_sent") cancelRef.current?.focus();
      return;
    }
    alertRef.current?.focus();
  }, [state]);

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen && (pending || inFlightRef.current)) return;
    setOpen(nextOpen);
    setState(nextOpen ? "reviewing" : "closed");
  }

  async function refreshAfterAttempt() {
    setState("refreshing");
    try {
      await refreshAuthoritativeList();
      return true;
    } catch {
      setState("refresh_error");
      return false;
    }
  }

  async function revokeSession() {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setState("revoking");

    try {
      const token = csrfToken ?? (await getDefaultCsrfToken());
      const request: SecuritySessionRevocationRequest = bulk
        ? {
            csrfToken: token,
            locale,
            confirmation: "revoke_other_sessions",
          }
        : {
            csrfToken: token,
            locale,
            confirmation: "revoke_session",
            sessionId: session.sessionId,
          };
      const result = await requestRevocation(request);

      if (result.status === "unauthenticated") {
        await navigateTo(getSecurityLoginPath(locale));
        return;
      }

      focusListHeadingOnCloseRef.current =
        result.status === "completed" && !bulk;
      const refreshed = await refreshAfterAttempt();
      if (!refreshed) {
        focusListHeadingOnCloseRef.current = false;
        return;
      }
      if (result.status === "completed") {
        setOpen(false);
        setState("closed");
      } else if (result.status === "reauthentication_required") {
        setState("reauthentication_required");
      } else {
        setState("revocation_error");
      }
    } catch {
      setState("recovering");
      try {
        await navigateTo(`${getSecurityPath(locale)}?state=recovered`);
        setOpen(false);
        setState("closed");
      } catch {
        setState("revocation_error");
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  async function sendReauthentication() {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setState("sending_reauthentication");

    try {
      const token = csrfToken ?? (await getDefaultCsrfToken());
      const result = await requestReauthentication({
        csrfToken: token,
        locale,
      });

      if (result.status === "unauthenticated") {
        await navigateTo(getSecurityLoginPath(locale));
        return;
      }
      if (result.status === "sent") {
        setState("reauthentication_sent");
      } else if (result.status === "rate_limited") {
        setState("reauthentication_rate_limited");
      } else {
        setState("reauthentication_error");
      }
    } catch {
      setState("reauthentication_error");
    } finally {
      inFlightRef.current = false;
    }
  }

  const reauthentication =
    state === "reauthentication_required" ||
    state === "sending_reauthentication" ||
    state === "reauthentication_sent" ||
    state === "reauthentication_rate_limited" ||
    state === "reauthentication_error";
  const reauthenticationError =
    state === "reauthentication_rate_limited" ||
    state === "reauthentication_error";
  const revocationError = state === "revocation_error";
  const refreshError = state === "refresh_error";
  const showRevocationAction =
    state === "reviewing" ||
    state === "revoking" ||
    state === "refreshing" ||
    state === "recovering" ||
    revocationError;
  const showReauthenticationAction =
    state === "reauthentication_required" ||
    state === "sending_reauthentication" ||
    reauthenticationError;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      disablePointerDismissal={pending}
    >
      <DialogTrigger
        render={
          <Button
            ref={triggerRef}
            variant="outline"
            className="min-h-11 min-w-11 whitespace-normal text-center motion-reduce:transition-none"
          />
        }
      >
        <ShieldXIcon data-icon="inline-start" aria-hidden="true" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        aria-busy={pending}
        closeLabel={messages.closeLabel}
        closeDisabled={pending}
        finalFocus={getFinalFocus}
        initialFocus={cancelRef}
        className="max-sm:w-[calc(100%-1rem)]"
      >
        <DialogHeader>
          <DialogTitle>
            {reauthentication
              ? messages.reauthenticationTitle
              : bulk
                ? messages.bulk.title
                : replacePlaceholder(
                  messages.title,
                  "number",
                  String(session.ordinal),
                )}
          </DialogTitle>
          {state === "reauthentication_required" ? (
            <DialogDescription
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="outline-none"
            >
              {messages.reauthenticationDescription}
            </DialogDescription>
          ) : reauthentication ? (
            <DialogDescription>
              {messages.reauthenticationDescription}
            </DialogDescription>
          ) : (
            <DialogDescription>
              {bulk ? messages.bulk.description : messages.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {!reauthentication ? (
          <div className="mt-5 flex min-w-0 flex-col gap-4">
            {!bulk ? (
              <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/60 p-3">
                <SecuritySessionTimestamp
                  kind="started"
                  locale={locale}
                  template={messages.startedAt}
                  unavailable={messages.unavailable}
                  value={session.createdAt}
                />
                <SecuritySessionTimestamp
                  kind="expires"
                  locale={locale}
                  template={messages.expiresAt}
                  unavailable={messages.unavailable}
                  value={session.expires}
                />
              </div>
            ) : null}
            <ul className="flex flex-col gap-2 text-sm text-foreground">
              {bulk ? (
                <>
                  <li>{messages.bulk.endOthers}</li>
                  <li>{messages.bulk.includeNew}</li>
                  <li>{messages.bulk.keepCurrent}</li>
                </>
              ) : (
                <>
                  <li>{messages.endSelected}</li>
                  <li>{messages.nextRequest}</li>
                  <li>{messages.keepOthers}</li>
                </>
              )}
            </ul>
            <div className="min-h-5">
              {revocationError || refreshError ? (
                <p
                  ref={alertRef}
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                  tabIndex={-1}
                  className="text-sm text-destructive outline-none"
                >
                  {refreshError
                    ? messages.refreshFailed
                    : messages.revocationFailed}
                </p>
              ) : pending ? (
                <p
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-sm text-muted-foreground"
                >
                  {state === "revoking"
                    ? bulk
                      ? messages.revokingOtherSessions
                      : messages.revoking
                    : state === "recovering"
                      ? messages.recovering
                      : messages.refreshing}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 min-h-5">
            {state === "sending_reauthentication" ? (
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-sm text-muted-foreground"
              >
                {messages.sendingLink}
              </p>
            ) : state === "reauthentication_sent" ? (
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-sm text-foreground"
              >
                {messages.sent}
              </p>
            ) : reauthenticationError ? (
              <p
                ref={alertRef}
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                tabIndex={-1}
                className="text-sm text-destructive outline-none"
              >
                {state === "reauthentication_rate_limited"
                  ? messages.rateLimited
                  : messages.sendFailed}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="min-h-11">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            className="min-h-11 min-w-11 whitespace-normal text-center motion-reduce:transition-none"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {state === "reauthentication_sent" || refreshError
              ? messages.close
              : messages.cancel}
          </Button>
          {showRevocationAction ? (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 min-w-11 whitespace-normal bg-red-700 text-center transition-none hover:bg-red-800 dark:bg-red-700 dark:hover:bg-red-600"
              disabled={pending}
              onClick={revokeSession}
            >
              <ShieldXIcon data-icon="inline-start" aria-hidden="true" />
              {bulk ? messages.bulk.confirm : messages.confirm}
            </Button>
          ) : null}
          {showReauthenticationAction ? (
            <Button
              type="button"
              className="min-h-11 min-w-11 whitespace-normal text-center motion-reduce:transition-none"
              disabled={pending}
              onClick={sendReauthentication}
            >
              {messages.sendLink}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}