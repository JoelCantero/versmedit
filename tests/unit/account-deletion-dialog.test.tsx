import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DeleteAccountDialog,
  type DeleteAccountDialogMessages,
} from "@/modules/account/deletion/components/delete-account-dialog";
import {
  ACCOUNT_DELETION_PENDING_STORAGE_KEY,
} from "@/modules/account/deletion/types";

const messages: DeleteAccountDialogMessages = {
  deleteTrigger: "Delete account",
  title: "Permanently delete your account?",
  description: "Review what happens before continuing.",
  irreversible: "This action is permanent and cannot be undone.",
  signOutEverywhere: "You will be signed out on this and every other device.",
  invalidateLinks: "Pending sign-in and signup links will stop working.",
  removeData: "Your profile, identities, sessions, and policy acceptances will be removed.",
  loseAccess: "You will no longer be able to access this account.",
  cancel: "Cancel",
  continue: "Continue",
  sendLink: "Send fresh link",
  sendingLink: "Sending link...",
  reauthSent: "Check your email before continuing.",
  reauthError: "We could not send the link. Try again.",
  confirmTitle: "Final confirmation",
  confirmDescription: "Deletion starts only after the next action.",
  confirmDelete: "Permanently delete account",
  deleting: "Deleting account...",
  deletionError: "We could not delete the account. Try again.",
  recovering: "Checking whether deletion completed...",
  closeLabel: "Close dialog",
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof DeleteAccountDialog>> = {}) {
  const requestReauthentication = vi.fn().mockResolvedValue({ status: "sent" });
  const deleteAccount = vi.fn().mockResolvedValue({
    status: "completed",
    redirectTo: "/account-deleted",
  });
  const checkSession = vi.fn().mockResolvedValue(true);
  const navigate = vi.fn();

  render(
    <DeleteAccountDialog
      locale="en"
      csrfToken="csrf"
      recentlyAuthenticated
      messages={messages}
      requestReauthentication={requestReauthentication}
      deleteAccount={deleteAccount}
      checkSession={checkSession}
      navigate={navigate}
      {...overrides}
    />,
  );

  return { requestReauthentication, deleteAccount, checkSession, navigate };
}

describe("DeleteAccountDialog US1", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("first opens a review with every consequence and makes no request", async () => {
    const user = userEvent.setup();
    const clients = renderDialog();
    const trigger = screen.getByRole("button", { name: "Delete account" });

    await user.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: messages.title })).toBeInTheDocument();
    expect(screen.getByText(messages.irreversible)).toBeInTheDocument();
    expect(screen.getByText(messages.signOutEverywhere)).toBeInTheDocument();
    expect(screen.getByText(messages.invalidateLinks)).toBeInTheDocument();
    expect(screen.getByText(messages.removeData)).toBeInTheDocument();
    expect(screen.getByText(messages.loseAccess)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.cancel })).toHaveFocus();
    expect(clients.requestReauthentication).not.toHaveBeenCalled();
    expect(clients.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires a separate final confirmation for a recent session", async () => {
    const user = userEvent.setup();
    const { deleteAccount, navigate } = renderDialog();

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: messages.confirmTitle })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: messages.confirmDelete }));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledOnce());
    expect(deleteAccount).toHaveBeenCalledWith({
      csrfToken: "csrf",
      locale: "en",
      confirmation: "permanently_delete",
    });
    expect(navigate).toHaveBeenCalledWith("/account-deleted");
    expect(sessionStorage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY)).toBeNull();
  });

  it("requires and sends a fresh link for a stale session", async () => {
    const user = userEvent.setup();
    const { requestReauthentication, deleteAccount } = renderDialog({
      recentlyAuthenticated: false,
    });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    expect(screen.getByRole("button", { name: messages.sendLink })).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: messages.sendLink }));
    await waitFor(() => expect(requestReauthentication).toHaveBeenCalledOnce());
    expect(requestReauthentication).toHaveBeenCalledWith({ csrfToken: "csrf", locale: "en" });
    expect(screen.getByText(messages.reauthSent)).toBeInTheDocument();
  });

  it("recovers a lost response by checking session once without deleting again", async () => {
    sessionStorage.setItem(
      ACCOUNT_DELETION_PENDING_STORAGE_KEY,
      JSON.stringify({ locale: "es", expiresAt: Date.now() + 60_000 }),
    );
    const checkSession = vi.fn().mockResolvedValue(false);
    const { deleteAccount, navigate } = renderDialog({ checkSession });

    await waitFor(() => expect(checkSession).toHaveBeenCalledOnce());
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/es/account-deleted");
    expect(sessionStorage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY)).toBeNull();
  });

  it("does not report success when the session endpoint fails during recovery", async () => {
    sessionStorage.setItem(
      ACCOUNT_DELETION_PENDING_STORAGE_KEY,
      JSON.stringify({ locale: "en", expiresAt: Date.now() + 60_000 }),
    );
    const fetchSession = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const navigate = vi.fn();
    renderDialog({ checkSession: undefined, navigate });

    await waitFor(() => expect(fetchSession).toHaveBeenCalledOnce());
    expect(navigate).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY),
    ).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(messages.recovering);

    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(fetchSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/account-deleted"));
    expect(sessionStorage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY)).toBeNull();
    fetchSession.mockRestore();
  });
});

describe("DeleteAccountDialog failure recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it.each(["cancel", "escape", "close"] as const)(
    "treats %s as the same safe cancellation and restores trigger focus",
    async (method) => {
      const user = userEvent.setup();
      renderDialog();
      const trigger = screen.getByRole("button", { name: messages.deleteTrigger });
      await user.click(trigger);

      if (method === "cancel") {
        await user.click(screen.getByRole("button", { name: messages.cancel }));
      } else if (method === "escape") {
        await user.keyboard("{Escape}");
      } else {
        await user.click(screen.getByRole("button", { name: messages.closeLabel }));
      }

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    },
  );

  it("locks dismissal and duplicate activation while deletion is pending", async () => {
    const user = userEvent.setup();
    let release: ((result: { status: "deletion_failed" }) => void) | undefined;
    const deleteAccount = vi.fn(
      () =>
        new Promise<{ status: "deletion_failed" }>((resolve) => {
          release = resolve;
        }),
    );
    renderDialog({ deleteAccount });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    const confirmation = screen.getByRole("button", { name: messages.confirmDelete });
    act(() => {
      confirmation.click();
      confirmation.click();
    });
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: messages.cancel })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.closeLabel })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    release?.({ status: "deletion_failed" });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(sessionStorage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY)).toBeNull();
  });

  it("restores controls and retries delivery without reloading", async () => {
    const user = userEvent.setup();
    const requestReauthentication = vi
      .fn()
      .mockResolvedValueOnce({ status: "unavailable" })
      .mockResolvedValueOnce({ status: "sent" });
    renderDialog({ recentlyAuthenticated: false, requestReauthentication });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    await user.click(screen.getByRole("button", { name: messages.sendLink }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: messages.sendLink }));

    await waitFor(() => expect(requestReauthentication).toHaveBeenCalledTimes(2));
    expect(screen.getByText(messages.reauthSent)).toBeInTheDocument();
  });

  it("navigates to localized sign-in when the session is lost before reauthentication", async () => {
    const user = userEvent.setup();
    const requestReauthentication = vi.fn().mockResolvedValue({
      status: "unauthenticated",
      redirectTo: "/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata",
    });
    const navigate = vi.fn();
    renderDialog({
      locale: "ca",
      recentlyAuthenticated: false,
      requestReauthentication,
      navigate,
    });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    await user.click(screen.getByRole("button", { name: messages.sendLink }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("navigates to localized sign-in when the session is lost before deletion", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn().mockResolvedValue({
      status: "unauthenticated",
      redirectTo: "/es/login?callbackUrl=%2Fes%2Faccount%2Fdata",
    });
    const navigate = vi.fn();
    renderDialog({ locale: "es", deleteAccount, navigate });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    await user.click(screen.getByRole("button", { name: messages.confirmDelete }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/es/login?callbackUrl=%2Fes%2Faccount%2Fdata",
      ),
    );
    expect(sessionStorage.getItem(ACCOUNT_DELETION_PENDING_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores the destructive action and retries a rolled-back deletion", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi
      .fn()
      .mockResolvedValueOnce({ status: "deletion_failed" })
      .mockResolvedValueOnce({ status: "completed", redirectTo: "/account-deleted" });
    const navigate = vi.fn();
    renderDialog({ deleteAccount, navigate });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    await user.click(screen.getByRole("button", { name: messages.confirmDelete }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: messages.confirmDelete }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(2));
    expect(navigate).toHaveBeenCalledWith("/account-deleted");
  });
});

describe("DeleteAccountDialog accessibility", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("associates the dialog name and description and contains keyboard focus", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    const dialog = screen.getByRole("dialog", { name: messages.title });

    expect(dialog).toHaveAccessibleDescription(messages.description);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messages.cancel })).toHaveFocus(),
    );
    const expectContainedFocus = () => {
      const active = document.activeElement as HTMLElement;
      expect(
        dialog.contains(active) || active.hasAttribute("data-base-ui-focus-guard"),
      ).toBe(true);
    };
    await user.tab({ shift: true });
    expectContainedFocus();
    await user.tab();
    expectContainedFocus();
  });

  it("announces pending work politely and failures assertively", async () => {
    const user = userEvent.setup();
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    const requestReauthentication = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    renderDialog({ recentlyAuthenticated: false, requestReauthentication });

    await user.click(screen.getByRole("button", { name: messages.deleteTrigger }));
    await user.click(screen.getByRole("button", { name: messages.continue }));
    await user.click(screen.getByRole("button", { name: messages.sendLink }));
    expect(screen.getByRole("status")).toHaveTextContent(messages.sendingLink);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");

    rejectRequest?.(new Error("provider detail"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent(messages.reauthError);
    expect(screen.getByRole("alert")).not.toHaveTextContent("provider detail");
  });

  it("renders the longest translated content without truncating controls", async () => {
    const user = userEvent.setup();
    const longMessages = Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [key, `${value} ${value}`]),
    ) as unknown as DeleteAccountDialogMessages;
    renderDialog({ messages: longMessages });

    await user.click(screen.getByRole("button", { name: longMessages.deleteTrigger }));
    expect(screen.getByRole("button", { name: longMessages.cancel })).toBeVisible();
    expect(screen.getByRole("button", { name: longMessages.continue })).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveClass("overflow-y-auto");
  });
});