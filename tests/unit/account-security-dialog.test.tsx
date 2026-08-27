import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAxeInJSDOM } from "../helpers/axe";

const mocks = vi.hoisted(() => ({
  routerRefresh: vi.fn(),
  routerPush: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.routerRefresh,
    push: mocks.routerPush,
  }),
}));
vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));

import {
  SecuritySessionDialog,
  type SecuritySessionDialogMessages,
} from "@/modules/account/security/components/security-session-dialog";
import {
  SecuritySessionList,
  type SecuritySessionListMessages,
} from "@/modules/account/security/components/security-session-list";

const dialogMessages: SecuritySessionDialogMessages = {
  closeLabel: "Close dialog",
  cancel: "Cancel",
  close: "Close",
  title: "Revoke session {number}?",
  description: "Review this session before you continue.",
  endSelected: "Only this session will end.",
  nextRequest: "Its next protected request will require signing in again.",
  keepOthers: "Your current session and every other session will remain active.",
  confirm: "Revoke session",
  startedAt: "Started: {date}",
  expiresAt: "Expires: {date}",
  unavailable: "Unavailable",
  revoking: "Revoking session...",
  refreshing: "Refreshing active sessions...",
  reauthenticationTitle: "Authenticate again to continue",
  reauthenticationDescription:
    "Use a new single-use email link before confirming this action.",
  sendLink: "Send fresh link",
  sent: "Check your email for the fresh authentication link. After using it, choose the action again.",
  sendingLink: "Sending link...",
  recovering:
    "Refreshing the active session list. The previous request will not be sent again.",
  sendFailed: "We could not send the link. No sessions changed. Try again.",
  rateLimited: "Too many attempts. No sessions changed. Try again later.",
  revocationFailed:
    "We could not update your sessions. No sessions changed. Review the list and try again.",
  refreshFailed:
    "We could not refresh your active sessions. Reload the page before trying again.",
  bulk: {
    title: "Revoke all other sessions?",
    description: "Review which sessions will end before you continue.",
    endOthers: "Every session except the one confirming this action will end.",
    includeNew:
      "Sessions created before you confirm are included, even if they are not shown here.",
    keepCurrent: "The session confirming this action will remain active.",
    confirm: "Revoke all other sessions",
  },
  revokingOtherSessions: "Revoking other sessions...",
};

const listMessages: SecuritySessionListMessages = {
  ariaLabel: "Active account sessions",
  sessionLabel: "Session {number}",
  current: "Current session",
  currentOnly: "Only your current session is active.",
  startedAt: dialogMessages.startedAt,
  expiresAt: dialogMessages.expiresAt,
  unavailable: dialogMessages.unavailable,
  signOut: "Sign out",
  revokeSession: "Revoke session",
  revokeOtherSessions: "Revoke all other sessions",
  dialog: dialogMessages,
};

const currentSession = {
  sessionId: "hidden-current-selector",
  createdAt: "2026-08-21T08:30:00.000Z",
  expires: "2026-08-24T08:30:00.000Z",
  current: true,
  ordinal: 1,
};

const otherSession = {
  sessionId: "hidden-other-selector",
  createdAt: "2026-08-22T10:15:00.000Z",
  expires: "2026-08-25T11:45:00.000Z",
  current: false,
  ordinal: 2,
};

const newlyCreatedSession = {
  sessionId: "hidden-new-session-selector",
  createdAt: "2026-08-22T11:30:00.000Z",
  expires: "2026-08-25T12:00:00.000Z",
  current: false,
  ordinal: 3,
};

async function expectNoSeriousAxeViolations() {
  const result = await runAxeInJSDOM(document.body);
  const seriousOrCritical = result.violations.filter((violation) =>
    violation.nodes.some((node) =>
      ["serious", "critical"].includes(node.impact ?? ""),
    ),
  );
  expect(seriousOrCritical).toEqual([]);
}

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof SecuritySessionDialog>> = {},
) {
  const requestRevocation = vi.fn().mockResolvedValue({ status: "completed" });
  const requestReauthentication = vi
    .fn()
    .mockResolvedValue({ status: "sent" });
  const refresh = vi.fn();
  const navigate = vi.fn();

  render(
    <SecuritySessionDialog
      locale="en"
      session={otherSession}
      csrfToken="csrf-token"
      triggerLabel="Revoke session"
      messages={dialogMessages}
      requestRevocation={requestRevocation}
      requestReauthentication={requestReauthentication}
      refresh={refresh}
      navigate={navigate}
      {...overrides}
    />,
  );

  return { requestRevocation, requestReauthentication, refresh, navigate };
}

function renderBulkDialog(
  overrides: Partial<React.ComponentProps<typeof SecuritySessionDialog>> = {},
) {
  const requestRevocation = vi.fn().mockResolvedValue({ status: "completed" });
  const requestReauthentication = vi
    .fn()
    .mockResolvedValue({ status: "sent" });
  const refresh = vi.fn();
  const navigate = vi.fn();

  render(
    <SecuritySessionDialog
      mode="bulk"
      locale="en"
      session={currentSession}
      csrfToken="csrf-token"
      triggerLabel="Revoke all other sessions"
      messages={dialogMessages}
      requestRevocation={requestRevocation}
      requestReauthentication={requestReauthentication}
      refresh={refresh}
      navigate={navigate}
      {...overrides}
    />,
  );

  return { requestRevocation, requestReauthentication, refresh, navigate };
}

describe("Account Security individual session review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("names the generic ordinal and repeats unambiguous immutable dates and consequences", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    const dialog = screen.getByRole("dialog", { name: "Revoke session 2?" });
    expect(dialog).toHaveAccessibleDescription(dialogMessages.description);
    expect(within(dialog).getByText(dialogMessages.endSelected)).toBeInTheDocument();
    expect(within(dialog).getByText(dialogMessages.nextRequest)).toBeInTheDocument();
    expect(within(dialog).getByText(dialogMessages.keepOthers)).toBeInTheDocument();
    expect(
      dialog.querySelector('time[data-kind="started"]'),
    ).toHaveAttribute("datetime", otherSession.createdAt);
    expect(
      dialog.querySelector('time[data-kind="expires"]'),
    ).toHaveAttribute("datetime", otherSession.expires);
    expect(dialog.innerHTML).not.toContain(otherSession.sessionId);
  });

  it("states honestly when the selected session start is unavailable", async () => {
    const user = userEvent.setup();
    renderDialog({ session: { ...otherSession, createdAt: null } });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Started:.*Unavailable/)).toBeInTheDocument();
    expect(dialog.querySelector('time[data-kind="started"]')).toBeNull();
  });

  it("keeps current-session revocation unavailable and exposes sign-out instead", async () => {
    const signOutCurrent = vi.fn();
    render(
      <SecuritySessionList
        locale="en"
        sessions={[currentSession, otherSession]}
        messages={listMessages}
        signOutCurrent={signOutCurrent}
      />,
    );

    const list = screen.getByRole("list", { name: listMessages.ariaLabel });
    const rows = within(list).getAllByRole("listitem");
    expect([...list.children].every((child) => child.tagName === "LI")).toBe(true);
    expect(within(list).queryByRole("separator")).not.toBeInTheDocument();
    expect(list.querySelector('[data-slot="item"]')).not.toBeInTheDocument();
    expect(within(rows[0]!).queryByRole("button", { name: "Revoke session" })).toBeNull();
    await userEvent.click(within(rows[0]!).getByRole("button", { name: "Sign out" }));
    expect(signOutCurrent).toHaveBeenCalledOnce();
    expect(within(rows[1]!).getByRole("button", { name: "Revoke session" })).toBeEnabled();
  });

  it.each(["cancel", "escape"] as const)(
    "closes on %s before submission and restores focus to the initiating control",
    async (method) => {
      const user = userEvent.setup();
      const { requestRevocation } = renderDialog();
      const trigger = screen.getByRole("button", { name: "Revoke session" });

      await user.click(trigger);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
      );
      if (method === "cancel") {
        await user.click(screen.getByRole("button", { name: "Cancel" }));
      } else {
        await user.keyboard("{Escape}");
      }

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
      expect(requestRevocation).not.toHaveBeenCalled();
    },
  );

  it("contains forward and reverse keyboard focus inside the review", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );

    for (const key of ["{Tab}", "{Tab}", "{Tab}", "{Shift>}{Tab}{/Shift}"]) {
      await user.keyboard(key);
      const activeElement = document.activeElement as HTMLElement;
      const insideFocusGuard =
        activeElement.hasAttribute("data-base-ui-focus-guard") &&
        activeElement.getAttribute("data-type") === "inside";
      expect(dialog.contains(activeElement) || insideFocusGuard).toBe(true);
    }
  });

  it("locks dismissal and duplicate submission while revocation is pending", async () => {
    const user = userEvent.setup();
    let release: ((value: { status: "completed" }) => void) | undefined;
    const requestRevocation = vi.fn(
      () =>
        new Promise<{ status: "completed" }>((resolve) => {
          release = resolve;
        }),
    );
    renderDialog({ requestRevocation });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const close = screen.getByRole("button", { name: "Close dialog" });
    const confirmation = screen.getByRole("button", { name: "Revoke session" });
    act(() => {
      confirmation.click();
      confirmation.click();
    });

    await waitFor(() => expect(requestRevocation).toHaveBeenCalledOnce());
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent(dialogMessages.revoking);
    expect(screen.getByRole("button", { name: "Cancel" })).toBe(cancel);
    expect(screen.getByRole("button", { name: "Close dialog" })).toBe(close);
    expect(screen.getByRole("button", { name: "Revoke session" })).toBe(
      confirmation,
    );
    expect(cancel).toBeDisabled();
    expect(close).toBeDisabled();
    expect(confirmation).toBeDisabled();
    expect(document.querySelector('[data-slot="spinner"]')).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    expect(requestRevocation).toHaveBeenCalledOnce();

    release?.({ status: "completed" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("focuses a generic transaction error after refreshing the authoritative list", async () => {
    const user = userEvent.setup();
    const requestRevocation = vi
      .fn()
      .mockResolvedValue({ status: "revocation_failed" });
    const { refresh } = renderDialog({ requestRevocation });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert")).toHaveTextContent(
      dialogMessages.revocationFailed,
    );
    expect(screen.getByRole("alert")).toHaveAttribute(
      "aria-live",
      "assertive",
    );
    expect(screen.getByRole("alert")).toHaveFocus();
    await expectNoSeriousAxeViolations();
  });

  it("focuses the active-sessions heading when a successful refresh removes the initiating control", async () => {
    function RemovedTriggerHarness() {
      const [removed, setRemoved] = useState(false);

      return (
        <>
          <h2 id="active-sessions-heading" tabIndex={-1}>
            Active sessions
          </h2>
          {removed ? null : (
            <SecuritySessionDialog
              locale="en"
              session={otherSession}
              csrfToken="csrf-token"
              triggerLabel="Revoke session"
              messages={dialogMessages}
              requestRevocation={vi.fn().mockResolvedValue({
                status: "completed",
              })}
              refresh={() => setRemoved(true)}
              navigate={vi.fn()}
            />
          )}
        </>
      );
    }

    const user = userEvent.setup();
    render(<RemovedTriggerHarness />);
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Revoke session",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Revoke session" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Active sessions" }),
    ).toHaveFocus();
  });

  it("refreshes after completion without optimistically removing the selected row", async () => {
    const user = userEvent.setup();
    let finishRefresh: (() => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    renderDialog({ refresh });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(dialogMessages.refreshing);
    finishRefresh?.();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("navigates once to an authoritative recovery render without replaying an ambiguous request", async () => {
    const user = userEvent.setup();
    const requestRevocation = vi.fn().mockRejectedValue(new TypeError("network lost"));
    let finishNavigation: (() => void) | undefined;
    const navigate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    const { refresh } = renderDialog({ requestRevocation, navigate });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        dialogMessages.recovering,
      ),
    );
    expect(requestRevocation).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/account/security?state=recovered");
    await act(async () => Promise.resolve());
    expect(requestRevocation).toHaveBeenCalledOnce();
    finishNavigation?.();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("fetches CSRF same-origin and posts only the strict individual payload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "csrf-from-server" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "completed" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn();
    render(
      <SecuritySessionDialog
        locale="ca"
        session={otherSession}
        triggerLabel="Revoke session"
        messages={dialogMessages}
        refresh={refresh}
        navigate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/auth/csrf",
      { method: "GET", credentials: "same-origin", cache: "no-store" },
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/account/security/sessions/revoke",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken: "csrf-from-server",
          locale: "ca",
          confirmation: "revoke_session",
          sessionId: otherSession.sessionId,
        }),
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("redirects an unauthenticated response and presents stale authentication generically", async () => {
    const user = userEvent.setup();
    const unauthenticated = vi.fn().mockResolvedValue({
      status: "unauthenticated",
      redirectTo: "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity",
    });
    const first = renderDialog({
      locale: "es",
      requestRevocation: unauthenticated,
    });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await waitFor(() =>
      expect(first.navigate).toHaveBeenCalledWith(
        "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity",
      ),
    );

    cleanup();
    const stale = vi.fn().mockResolvedValue({
      status: "reauthentication_required",
    });
    const second = renderDialog({ requestRevocation: stale });
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    await waitFor(() => expect(second.refresh).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("heading", { name: dialogMessages.reauthenticationTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      dialogMessages.reauthenticationDescription,
    );
    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("posts only CSRF proof and locale, then shows a safe sent state", async () => {
    const user = userEvent.setup();
    const requestRevocation = vi.fn().mockResolvedValue({
      status: "reauthentication_required",
    });
    const requestReauthentication = vi.fn().mockResolvedValue({
      status: "sent",
    });
    const { refresh } = renderDialog({
      locale: "es",
      requestRevocation,
      requestReauthentication,
    });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: dialogMessages.sendLink }));

    await waitFor(() => expect(requestReauthentication).toHaveBeenCalledOnce());
    expect(requestReauthentication).toHaveBeenCalledWith({
      csrfToken: "csrf-token",
      locale: "es",
    });
    expect(requestRevocation).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(dialogMessages.sent);
    expect(
      screen.queryByRole("button", { name: "Revoke session" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: dialogMessages.close })).toHaveFocus();
  });

  it("locks every command and dismissal path while sending a fresh link", async () => {
    const user = userEvent.setup();
    const requestRevocation = vi.fn().mockResolvedValue({
      status: "reauthentication_required",
    });
    let finishSending: ((value: { status: "sent" }) => void) | undefined;
    const requestReauthentication = vi.fn(
      () =>
        new Promise<{ status: "sent" }>((resolve) => {
          finishSending = resolve;
        }),
    );
    renderDialog({ requestRevocation, requestReauthentication });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: dialogMessages.sendLink }));
    await waitFor(() => expect(requestReauthentication).toHaveBeenCalledOnce());

    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const close = screen.getByRole("button", { name: "Close dialog" });
    const send = screen.getByRole("button", { name: dialogMessages.sendLink });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent(
      dialogMessages.sendingLink,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBe(cancel);
    expect(screen.getByRole("button", { name: "Close dialog" })).toBe(close);
    expect(screen.getByRole("button", { name: dialogMessages.sendLink })).toBe(
      send,
    );
    expect(cancel).toBeDisabled();
    expect(close).toBeDisabled();
    expect(send).toBeDisabled();
    await expectNoSeriousAxeViolations();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    expect(requestReauthentication).toHaveBeenCalledOnce();

    finishSending?.({ status: "sent" });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(dialogMessages.sent),
    );
  });

  it.each([
    [
      "rate_limited",
      { status: "rate_limited" as const, retryAfter: 611 },
      dialogMessages.rateLimited,
    ],
    [
      "unavailable",
      { status: "unavailable" as const },
      dialogMessages.sendFailed,
    ],
  ])("shows a retryable generic %s error without server detail", async (_, outcome, message) => {
    const user = userEvent.setup();
    const requestRevocation = vi.fn().mockResolvedValue({
      status: "reauthentication_required",
    });
    const requestReauthentication = vi.fn().mockResolvedValue(outcome);
    renderDialog({ requestRevocation, requestReauthentication });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: dialogMessages.sendLink }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveFocus();
    expect(alert).not.toHaveTextContent("611");
    expect(
      screen.getByRole("button", { name: dialogMessages.sendLink }),
    ).toBeEnabled();
    expect(requestRevocation).toHaveBeenCalledOnce();
    await expectNoSeriousAxeViolations();
  });

  it("uses the fixed localized login path for a reauthentication 401", async () => {
    const user = userEvent.setup();
    const requestRevocation = vi.fn().mockResolvedValue({
      status: "reauthentication_required",
    });
    const requestReauthentication = vi.fn().mockResolvedValue({
      status: "unauthenticated",
      redirectTo: "https://unsafe.example.test",
    });
    const { navigate } = renderDialog({
      locale: "ca",
      requestRevocation,
      requestReauthentication,
    });

    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: "Revoke session" }));
    await user.click(screen.getByRole("button", { name: dialogMessages.sendLink }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity",
      ),
    );
    expect(navigate).not.toHaveBeenCalledWith("https://unsafe.example.test");
  });
});

describe("Account Security bulk session review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("explains the confirmation-time scope without claiming an authoritative count", async () => {
    const user = userEvent.setup();
    const { requestRevocation, refresh } = renderBulkDialog();

    await user.click(
      screen.getByRole("button", { name: "Revoke all other sessions" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: dialogMessages.bulk.title,
    });
    expect(dialog).toHaveAccessibleDescription(dialogMessages.bulk.description);
    expect(within(dialog).getByText(dialogMessages.bulk.endOthers)).toBeInTheDocument();
    expect(within(dialog).getByText(dialogMessages.bulk.includeNew)).toBeInTheDocument();
    expect(within(dialog).getByText(dialogMessages.bulk.keepCurrent)).toBeInTheDocument();
    expect(dialog.querySelector("time")).toBeNull();
    expect(dialog).not.toHaveTextContent(/\b(?:2|two)\b/i);
    await expectNoSeriousAxeViolations();

    await user.click(
      within(dialog).getByRole("button", {
        name: dialogMessages.bulk.confirm,
      }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(requestRevocation).toHaveBeenCalledWith({
      csrfToken: "csrf-token",
      locale: "en",
      confirmation: "revoke_other_sessions",
    });
  });

  it.each(["cancel", "escape"] as const)(
    "closes bulk review on %s and restores its initiating control",
    async (method) => {
      const user = userEvent.setup();
      const { requestRevocation } = renderBulkDialog();
      const trigger = screen.getByRole("button", {
        name: "Revoke all other sessions",
      });

      await user.click(trigger);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
      );
      if (method === "cancel") {
        await user.click(screen.getByRole("button", { name: "Cancel" }));
      } else {
        await user.keyboard("{Escape}");
      }

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveFocus();
      expect(requestRevocation).not.toHaveBeenCalled();
    },
  );

  it("locks duplicate confirmation and every dismissal path while bulk revocation is pending", async () => {
    const user = userEvent.setup();
    let release: ((value: { status: "completed" }) => void) | undefined;
    const requestRevocation = vi.fn(
      () =>
        new Promise<{ status: "completed" }>((resolve) => {
          release = resolve;
        }),
    );
    renderBulkDialog({ requestRevocation });

    await user.click(
      screen.getByRole("button", { name: "Revoke all other sessions" }),
    );
    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const close = screen.getByRole("button", { name: "Close dialog" });
    const confirmation = screen.getByRole("button", {
      name: dialogMessages.bulk.confirm,
    });
    act(() => {
      confirmation.click();
      confirmation.click();
    });

    await waitFor(() => expect(requestRevocation).toHaveBeenCalledOnce());
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent(
      dialogMessages.revokingOtherSessions,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBe(cancel);
    expect(screen.getByRole("button", { name: "Close dialog" })).toBe(close);
    expect(
      screen.getByRole("button", { name: dialogMessages.bulk.confirm }),
    ).toBe(confirmation);
    expect(cancel).toBeDisabled();
    expect(close).toBeDisabled();
    expect(confirmation).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(requestRevocation).toHaveBeenCalledOnce();

    release?.({ status: "completed" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps a session added while review is open in the targetless confirmation scope", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "csrf-from-server" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "completed" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <SecuritySessionList
        locale="en"
        sessions={[currentSession, otherSession]}
        messages={listMessages}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Revoke all other sessions" }),
    );
    rerender(
      <SecuritySessionList
        locale="en"
        sessions={[currentSession, otherSession, newlyCreatedSession]}
        messages={listMessages}
      />,
    );
    const dialog = screen.getByRole("dialog", {
      name: dialogMessages.bulk.title,
    });
    expect(within(dialog).getByText(dialogMessages.bulk.includeNew)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", {
        name: dialogMessages.bulk.confirm,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/account/security/sessions/revoke-others",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken: "csrf-from-server",
          locale: "en",
          confirmation: "revoke_other_sessions",
        }),
      },
    ]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
  });

  it("renders a localized unavailable bulk action when only current remains", () => {
    render(
      <SecuritySessionList
        locale="en"
        sessions={[currentSession]}
        messages={listMessages}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Revoke all other sessions" }),
    ).toBeDisabled();
    expect(screen.getByText(listMessages.currentOnly)).toBeInTheDocument();
  });

  it("refreshes authoritatively and focuses the generic rollback error", async () => {
    const user = userEvent.setup();
    const requestRevocation = vi
      .fn()
      .mockResolvedValue({ status: "revocation_failed" });
    const { refresh } = renderBulkDialog({ requestRevocation });

    await user.click(
      screen.getByRole("button", { name: "Revoke all other sessions" }),
    );
    await user.click(
      screen.getByRole("button", { name: dialogMessages.bulk.confirm }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert")).toHaveTextContent(
      dialogMessages.revocationFailed,
    );
    expect(screen.getByRole("alert")).toHaveFocus();
  });
});