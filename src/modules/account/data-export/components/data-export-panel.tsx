"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, FileJsonIcon, MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  PersonalDataExportAuthorizationState,
  PersonalDataExportCommand,
  PersonalDataExportProblemStatus,
  PersonalDataExportRequestResult,
  PersonalDataExportVerificationResult,
} from "@/modules/account/data-export/types";
import type { AccountLocale } from "@/modules/account/types";

export interface DataExportPanelMessages {
  title: string;
  description: string;
  sensitiveWarning: string;
  request: string;
  requesting: string;
  sent: string;
  ready: string;
  expiringSoon: string;
  download: string;
  downloading: string;
  downloaded: string;
  expired: string;
  requestNew: string;
  invalid: string;
  requestError: string;
  downloadError: string;
  rateLimited: string;
  availableFor: string;
}

type DownloadResult =
  | { status: "completed"; blob: Blob; filename: string }
  | {
      status: PersonalDataExportProblemStatus;
      retryAfter?: number;
      redirectTo?: string;
    };

interface DataExportPanelProps {
  locale: AccountLocale;
  authorizationState: PersonalDataExportAuthorizationState;
  callbackNotice: PersonalDataExportVerificationResult | null;
  messages: DataExportPanelMessages;
  csrfToken?: string;
  requestExport?: (
    command: PersonalDataExportCommand,
  ) => Promise<PersonalDataExportRequestResult>;
  downloadExport?: (
    command: PersonalDataExportCommand,
  ) => Promise<DownloadResult>;
  saveDownload?: (blob: Blob, filename: string) => void;
  navigate?: (path: string) => void;
}

type PanelState =
  | "idle"
  | "requesting"
  | "sent"
  | "ready"
  | "downloading"
  | "downloaded"
  | "expired"
  | "invalid"
  | "request_error"
  | "download_error"
  | "rate_limited";

type RetryAction = "request" | "download";

const MAX_RETRY_AFTER_SECONDS = 15 * 60;

function secondsUntil(timestamp: string) {
  return Math.max(0, Math.ceil((new Date(timestamp).getTime() - Date.now()) / 1_000));
}

function formatRemainingTime(locale: AccountLocale, seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const minuteText = new Intl.NumberFormat(locale, {
    useGrouping: false,
  }).format(minutes);
  const secondText = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(remainder);
  return `${minuteText}:${secondText}`;
}

function normalizeRetryAfter(value: number | undefined) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(
    MAX_RETRY_AFTER_SECONDS,
    Math.max(1, Math.ceil(value ?? 1)),
  );
}

function initialPanelState(
  authorization: PersonalDataExportAuthorizationState,
  notice: PersonalDataExportVerificationResult | null,
): PanelState {
  if (notice?.status === "invalid") return "invalid";
  if (notice?.status === "rate_limited") return "rate_limited";
  if (authorization.status === "ready") return "ready";
  if (notice?.status === "ready") return "invalid";
  return authorization.status === "expired" ? "expired" : "idle";
}

async function postJson(
  path: string,
  command: PersonalDataExportCommand,
) {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}

async function defaultRequestClient(
  command: PersonalDataExportCommand,
): Promise<PersonalDataExportRequestResult> {
  const response = await postJson("/api/account/data-export/request", command);
  const result = (await response.json().catch(() => null)) as
    | PersonalDataExportRequestResult
    | null;
  return result ?? { status: "unavailable" };
}

async function defaultDownloadClient(
  command: PersonalDataExportCommand,
): Promise<DownloadResult> {
  const response = await postJson("/api/account/data-export/download", command);
  if (response.ok) {
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = disposition.match(
      /^attachment; filename="(personal-data-export-[0-9]{8}T[0-9]{6}Z\.json)"$/u,
    )?.[1];
    if (!filename) return { status: "unavailable" };
    return { status: "completed", blob: await response.blob(), filename };
  }
  const result = (await response.json().catch(() => null)) as
    | Exclude<DownloadResult, { status: "completed" }>
    | null;
  return result ?? { status: "unavailable" };
}

function defaultSaveDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

async function getCsrfToken(provided?: string) {
  if (provided) return provided;
  const response = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as
    | { csrfToken?: unknown }
    | null;
  if (!response.ok || typeof result?.csrfToken !== "string" || !result.csrfToken) {
    throw new Error("CSRF token unavailable");
  }
  return result.csrfToken;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export function DataExportPanel({
  locale,
  authorizationState,
  callbackNotice,
  messages,
  csrfToken,
  requestExport = defaultRequestClient,
  downloadExport = defaultDownloadClient,
  saveDownload = defaultSaveDownload,
  navigate = defaultNavigate,
}: DataExportPanelProps) {
  const [state, setState] = useState(() =>
    initialPanelState(authorizationState, callbackNotice),
  );
  const [retryAction, setRetryAction] = useState<RetryAction>("request");
  const [retryUntil, setRetryUntil] = useState(() =>
    callbackNotice?.status === "rate_limited"
      ? Date.now() + normalizeRetryAfter(callbackNotice.retryAfter) * 1_000
      : null,
  );
  const [retryRemaining, setRetryRemaining] = useState(() =>
    callbackNotice?.status === "rate_limited"
      ? normalizeRetryAfter(callbackNotice.retryAfter)
      : 0,
  );
  const [authorizationRemaining, setAuthorizationRemaining] = useState(() =>
    authorizationState.status === "ready"
      ? secondsUntil(authorizationState.expiresAt)
      : 0,
  );
  const inFlightRef = useRef(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const expiryFocusRef = useRef<boolean | null>(null);
  const callbackReadyFocusedRef = useRef(false);
  const pending = state === "requesting" || state === "downloading";

  function enterRateLimit(value: number | undefined, action: RetryAction) {
    const seconds = normalizeRetryAfter(value);
    setRetryRemaining(seconds);
    setRetryUntil(Date.now() + seconds * 1_000);
    setRetryAction(action);
    setState("rate_limited");
  }

  async function requestConfirmation() {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setState("requesting");
    try {
      const result = await requestExport({
        csrfToken: await getCsrfToken(csrfToken),
        locale,
      });
      if (result.status === "sent") setState("sent");
      else if (result.status === "unauthenticated" && result.redirectTo) {
        navigate(result.redirectTo);
      } else if (result.status === "rate_limited") {
        enterRateLimit(result.retryAfter, "request");
      } else setState("request_error");
    } catch {
      setState("request_error");
    } finally {
      inFlightRef.current = false;
    }
  }

  async function download() {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setState("downloading");
    try {
      const result = await downloadExport({
        csrfToken: await getCsrfToken(csrfToken),
        locale,
      });
      if (result.status === "completed") {
        saveDownload(result.blob, result.filename);
        setState("downloaded");
      } else if (result.status === "unauthenticated" && result.redirectTo) {
        navigate(result.redirectTo);
      } else if (result.status === "not_ready") setState("expired");
      else if (result.status === "rate_limited") {
        enterRateLimit(result.retryAfter, "download");
      } else setState("download_error");
    } catch {
      setState("download_error");
    } finally {
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (authorizationState.status !== "ready") return;
    const expiresAt = authorizationState.expiresAt;
    const update = () => {
      const remaining = secondsUntil(expiresAt);
      setAuthorizationRemaining(remaining);
      if (remaining !== 0) return;
      setState((current) => {
        if (
          current !== "ready" &&
          current !== "downloading" &&
          current !== "downloaded" &&
          current !== "download_error"
        ) {
          return current;
        }
        expiryFocusRef.current =
          document.activeElement === downloadButtonRef.current;
        return "expired";
      });
    };
    const initialTimer = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [authorizationState]);

  useEffect(() => {
    if (state !== "rate_limited" || retryUntil === null) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1_000));
      setRetryRemaining(remaining);
      if (remaining !== 0) return;
      setState(
        retryAction === "download" &&
          authorizationState.status === "ready" &&
          secondsUntil(authorizationState.expiresAt) > 0
          ? "ready"
          : "idle",
      );
    };
    const initialTimer = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [authorizationState, retryAction, retryUntil, state]);

  const requestLabel =
    state === "requesting"
      ? messages.requesting
      : state === "idle"
        ? messages.request
        : messages.requestNew;
  const canDownload =
    state === "ready" ||
    state === "downloading" ||
    state === "downloaded" ||
    state === "download_error" ||
    (state === "rate_limited" && retryAction === "download");
  const status =
    state === "requesting"
      ? messages.requesting
      : state === "sent"
        ? messages.sent
        : state === "downloading"
          ? messages.downloading
          : state === "downloaded"
            ? messages.downloaded
            : state === "ready"
              ? authorizationRemaining <= 60
                ? messages.expiringSoon
                : messages.ready
              : null;
  const error =
    state === "invalid"
      ? messages.invalid
      : state === "expired"
        ? messages.expired
        : state === "request_error"
          ? messages.requestError
          : state === "download_error"
            ? messages.downloadError
            : state === "rate_limited"
              ? messages.rateLimited.replace(
                  "{seconds}",
                  String(Math.max(1, retryRemaining)),
                )
              : null;
  const showAuthorizationCountdown =
    authorizationState.status === "ready" &&
    authorizationRemaining > 0 &&
    (state === "ready" ||
      state === "downloading" ||
      state === "downloaded" ||
      state === "download_error" ||
      (state === "rate_limited" && retryAction === "download"));

  useEffect(() => {
    if (
      state === "invalid" ||
      state === "request_error" ||
      state === "download_error" ||
      state === "rate_limited"
    ) {
      alertRef.current?.focus();
      return;
    }
    if (state === "expired") {
      if (expiryFocusRef.current) requestButtonRef.current?.focus();
      else alertRef.current?.focus();
      expiryFocusRef.current = null;
    }
  }, [state]);

  useEffect(() => {
    if (
      !callbackReadyFocusedRef.current &&
      callbackNotice?.status === "ready" &&
      state === "ready"
    ) {
      callbackReadyFocusedRef.current = true;
      statusRef.current?.focus();
    }
  }, [callbackNotice, state]);

  return (
    <section
      aria-labelledby="personal-data-export-heading"
      aria-busy={pending}
      className="space-y-5 border-t border-border pt-8"
    >
      <div className="space-y-2">
        <h2
          id="personal-data-export-heading"
          className="text-lg font-semibold text-foreground"
        >
          {messages.title}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {messages.description}
        </p>
      </div>

      <div className="flex max-w-2xl gap-3 border-l-2 border-border pl-4 text-sm text-muted-foreground">
        <FileJsonIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>{messages.sensitiveWarning}</p>
      </div>

      {status ? (
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="text-sm text-foreground outline-none"
        >
          {status}
        </p>
      ) : null}
      {showAuthorizationCountdown ? (
        <p aria-live="off" className="text-sm text-muted-foreground">
          {messages.availableFor.replace(
            "{time}",
            formatRemainingTime(locale, authorizationRemaining),
          )}
        </p>
      ) : null}
      {error ? (
        <p
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive outline-none"
        >
          {error}
        </p>
      ) : null}

      {canDownload ? (
        <Button
          ref={downloadButtonRef}
          type="button"
          disabled={pending || (state === "rate_limited" && retryRemaining > 0)}
          onClick={download}
          className="min-h-11 w-full min-w-11 whitespace-normal text-center motion-reduce:transition-none sm:w-auto sm:min-w-48"
        >
          <DownloadIcon data-icon="inline-start" aria-hidden="true" />
          {state === "downloading" ? messages.downloading : messages.download}
        </Button>
      ) : (
        <Button
          ref={requestButtonRef}
          type="button"
          disabled={pending || (state === "rate_limited" && retryRemaining > 0)}
          onClick={requestConfirmation}
          className="min-h-11 w-full min-w-11 whitespace-normal text-center motion-reduce:transition-none sm:w-auto sm:min-w-52"
        >
          <MailIcon data-icon="inline-start" aria-hidden="true" />
          {requestLabel}
        </Button>
      )}
    </section>
  );
}