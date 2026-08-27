"use client";

import { useEffect, useRef, useState } from "react";

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
import {
  clearPendingDeletionSignal,
  recoverPendingDeletion,
  writePendingDeletionSignal,
} from "@/modules/account/deletion/schema";
import type {
  AccountDeletionCommand,
  AccountDeletionReauthenticationRequest,
  AccountDeletionReauthenticationResult,
  AccountDeletionResult,
  AccountDeletionUiState,
} from "@/modules/account/deletion/types";
import type { AccountLocale } from "@/modules/account/types";

export interface DeleteAccountDialogMessages {
  deleteTrigger: string;
  title: string;
  description: string;
  irreversible: string;
  signOutEverywhere: string;
  invalidateLinks: string;
  removeData: string;
  loseAccess: string;
  cancel: string;
  continue: string;
  sendLink: string;
  sendingLink: string;
  reauthSent: string;
  reauthError: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmDelete: string;
  deleting: string;
  deletionError: string;
  recovering: string;
  closeLabel: string;
}

interface DeleteAccountDialogProps {
  locale: AccountLocale;
  csrfToken?: string;
  recentlyAuthenticated: boolean;
  messages: DeleteAccountDialogMessages;
  intent?: boolean;
  requestReauthentication?: (
    request: AccountDeletionReauthenticationRequest,
  ) => Promise<AccountDeletionReauthenticationResult>;
  deleteAccount?: (request: AccountDeletionCommand) => Promise<AccountDeletionResult>;
  checkSession?: () => Promise<boolean>;
  navigate?: (path: string) => void;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

function defaultReauthenticationClient(request: AccountDeletionReauthenticationRequest) {
  return postJson<AccountDeletionReauthenticationResult>(
    "/api/account/deletion/reauthenticate",
    request,
  );
}

function defaultDeletionClient(request: AccountDeletionCommand) {
  return postJson<AccountDeletionResult>("/api/account/deletion", request);
}

async function defaultSessionClient() {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("session status unavailable");
  const session = (await response.json()) as { user?: { id?: unknown } };
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new Error("invalid session response");
  }
  return typeof session?.user?.id === "string";
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function Consequences({ messages }: { messages: DeleteAccountDialogMessages }) {
  return (
    <ul className="space-y-2 text-sm text-foreground">
      <li>{messages.irreversible}</li>
      <li>{messages.signOutEverywhere}</li>
      <li>{messages.invalidateLinks}</li>
      <li>{messages.removeData}</li>
      <li>{messages.loseAccess}</li>
    </ul>
  );
}

export function DeleteAccountDialog({
  locale,
  csrfToken,
  recentlyAuthenticated,
  messages,
  intent = false,
  requestReauthentication = defaultReauthenticationClient,
  deleteAccount = defaultDeletionClient,
  checkSession = defaultSessionClient,
  navigate = defaultNavigate,
}: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(intent);
  const [state, setState] = useState<AccountDeletionUiState>(
    intent ? "reviewing" : "closed",
  );
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const inFlightRef = useRef(false);
  const pending =
    state === "sending_reauth" || state === "deleting" || state === "recovering";

  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    const response = await fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { csrfToken?: unknown }
      | null;
    if (typeof payload?.csrfToken !== "string" || !payload.csrfToken) {
      throw new Error("missing CSRF token");
    }
    return payload.csrfToken;
  }

  useEffect(() => {
    let active = true;
    void recoverPendingDeletion({
      storage: window.sessionStorage,
      checkSession,
    }).then((result) => {
      if (!active) return;
      if (result.status === "completed") {
        navigate(result.redirectTo);
      } else if (result.status === "retry") {
        setOpen(true);
        setState("deletion_error");
      } else if (result.status === "pending") {
        setOpen(true);
        setState("recovering");
      }
    });
    return () => {
      active = false;
    };
  }, [checkSession, navigate]);

  useEffect(() => {
    if (state !== "reauth_error" && state !== "deletion_error") return;
    errorRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (state !== "recovering") return;

    const recover = () => {
      void recoverPendingDeletion({
        storage: window.sessionStorage,
        checkSession,
      }).then((result) => {
        if (result.status === "completed") {
          navigate(result.redirectTo);
        } else if (result.status === "retry") {
          setState("deletion_error");
        }
      });
    };
    window.addEventListener("online", recover, { once: true });
    return () => window.removeEventListener("online", recover);
  }, [checkSession, navigate, state]);

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen && (pending || inFlightRef.current)) return;
    setOpen(nextOpen);
    setState(nextOpen ? "reviewing" : "closed");
  }

  async function sendReauthentication() {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setState("sending_reauth");
    try {
      const token = await getCsrfToken();
      const result = await requestReauthentication({ csrfToken: token, locale });
      if (result.status === "sent") {
        setState("reauth_sent");
      } else if (result.status === "unauthenticated" && result.redirectTo) {
        navigate(result.redirectTo);
      } else {
        setState("reauth_error");
      }
    } catch {
      setState("reauth_error");
    } finally {
      inFlightRef.current = false;
    }
  }

  async function permanentlyDelete() {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setState("deleting");
    let submitted = false;
    try {
      const token = await getCsrfToken();
      writePendingDeletionSignal(window.sessionStorage, locale);
      submitted = true;
      const result = await deleteAccount({
        csrfToken: token,
        locale,
        confirmation: "permanently_delete",
      });
      clearPendingDeletionSignal(window.sessionStorage);
      if (result.status === "completed") {
        navigate(result.redirectTo);
      } else if (result.status === "reauthentication_required") {
        setState("reauth_required");
      } else if (result.status === "unauthenticated" && result.redirectTo) {
        navigate(result.redirectTo);
      } else {
        setState("deletion_error");
      }
    } catch {
      setState(submitted ? "recovering" : "deletion_error");
    } finally {
      inFlightRef.current = false;
    }
  }

  const reviewState = state === "reviewing" || state === "reauth_required";
  const finalState = state === "final_ready" || state === "deleting" ||
    state === "deletion_error" || state === "recovering";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal={pending}>
      <DialogTrigger
        render={<Button variant="destructive" className="min-h-11" />}
      >
        {messages.deleteTrigger}
      </DialogTrigger>
      <DialogContent
        aria-busy={pending}
        closeLabel={messages.closeLabel}
        initialFocus={cancelRef}
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>
            {finalState ? messages.confirmTitle : messages.title}
          </DialogTitle>
          <DialogDescription>
            {finalState ? messages.confirmDescription : messages.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-4">
          {(reviewState || finalState) && <Consequences messages={messages} />}

          {state === "reauth_sent" ? (
            <p role="status" aria-live="polite" className="text-sm text-foreground">
              {messages.reauthSent}
            </p>
          ) : null}
          {state === "reauth_error" || state === "deletion_error" ? (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="text-sm text-destructive outline-none"
            >
              {state === "reauth_error" ? messages.reauthError : messages.deletionError}
            </p>
          ) : null}
          {pending ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {state === "sending_reauth"
                ? messages.sendingLink
                : state === "deleting"
                  ? messages.deleting
                  : messages.recovering}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {!pending ? (
            <Button ref={cancelRef} type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages.cancel}
            </Button>
          ) : null}
          {state === "reviewing" ? (
            <Button
              type="button"
              onClick={() =>
                setState(recentlyAuthenticated ? "final_ready" : "reauth_required")
              }
            >
              {messages.continue}
            </Button>
          ) : null}
          {state === "reauth_required" || state === "reauth_error" ? (
            <Button type="button" onClick={sendReauthentication}>
              {messages.sendLink}
            </Button>
          ) : null}
          {state === "final_ready" || state === "deletion_error" ? (
            <Button type="button" variant="destructive" onClick={permanentlyDelete}>
              {messages.confirmDelete}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}