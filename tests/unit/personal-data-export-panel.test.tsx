import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DataExportPanel,
  type DataExportPanelMessages,
} from "@/modules/account/data-export/components/data-export-panel";
import { runAxeInJSDOM } from "../helpers/axe";

const messages: DataExportPanelMessages = {
  title: "Download your data",
  description: "Create a JSON snapshot of personal data linked to your account.",
  sensitiveWarning: "This file may contain sensitive information. Store it securely.",
  request: "Request data export",
  requesting: "Sending confirmation...",
  sent: "Check your email for a confirmation link.",
  ready: "Your export is ready to download.",
  expiringSoon: "Your download authorization expires soon.",
  download: "Download data",
  downloading: "Preparing download...",
  downloaded: "Your data export was downloaded.",
  expired: "Your download authorization expired.",
  requestNew: "Request new confirmation",
  invalid: "This confirmation link is not valid. Request a new one.",
  requestError: "We could not send the confirmation. Try again.",
  downloadError: "We could not prepare your export. Try again.",
  rateLimited: "Too many attempts. Try again in {seconds} seconds.",
  availableFor: "Available for {time}.",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("DataExportPanel", () => {
  it("moves from explicit request through stable pending to sent", async () => {
    const user = userEvent.setup();
    let release: ((value: { status: "sent" }) => void) | undefined;
    const requestExport = vi.fn(
      () =>
        new Promise<{ status: "sent" }>((resolve) => {
          release = resolve;
        }),
    );
    render(
      <DataExportPanel
        locale="en"
        authorizationState={{ status: "absent" }}
        callbackNotice={null}
        csrfToken="proof"
        messages={messages}
        requestExport={requestExport}
      />,
    );

    const button = screen.getByRole("button", { name: messages.request });
    await user.click(button);
    expect(screen.getByRole("button", { name: messages.requesting })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(messages.requesting);
    release?.({ status: "sent" });
    expect(await screen.findByText(messages.sent)).toHaveAttribute("role", "status");
    expect(requestExport).toHaveBeenCalledExactlyOnceWith({
      csrfToken: "proof",
      locale: "en",
    });
  });

  it("never downloads on ready render and requires a separate explicit action", async () => {
    const user = userEvent.setup();
    const downloadExport = vi.fn().mockResolvedValue({
      status: "completed",
      blob: new Blob(["{}"], { type: "application/json" }),
      filename: "personal-data-export-20260823T120000Z.json",
    });
    const saveDownload = vi.fn();
    render(
      <DataExportPanel
        locale="ca"
        authorizationState={{
          status: "ready",
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        }}
        callbackNotice={{ status: "ready", locale: "ca" }}
        csrfToken="proof"
        messages={messages}
        downloadExport={downloadExport}
        saveDownload={saveDownload}
      />,
    );

    expect(downloadExport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: messages.download }));
    expect(await screen.findByText(messages.downloaded)).toHaveAttribute(
      "role",
      "status",
    );
    expect(downloadExport).toHaveBeenCalledExactlyOnceWith({
      csrfToken: "proof",
      locale: "ca",
    });
    expect(saveDownload).toHaveBeenCalledExactlyOnceWith(
      expect.any(Blob),
      "personal-data-export-20260823T120000Z.json",
    );
  });

  it("renders generic invalid callback state without starting protected work", () => {
    const requestExport = vi.fn();
    const downloadExport = vi.fn();
    render(
      <DataExportPanel
        locale="es"
        authorizationState={{ status: "absent" }}
        callbackNotice={{ status: "invalid", locale: "es" }}
        messages={messages}
        requestExport={requestExport}
        downloadExport={downloadExport}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messages.invalid);
    expect(requestExport).not.toHaveBeenCalled();
    expect(downloadExport).not.toHaveBeenCalled();
  });

  it("focuses a generic request error and offers only an explicit retry", async () => {
    const user = userEvent.setup();
    const requestExport = vi.fn().mockResolvedValue({ status: "unavailable" });
    render(
      <DataExportPanel
        locale="en"
        authorizationState={{ status: "absent" }}
        callbackNotice={null}
        csrfToken="proof"
        messages={messages}
        requestExport={requestExport}
      />,
    );

    await user.click(screen.getByRole("button", { name: messages.request }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(messages.requestError);
    expect(alert).toHaveFocus();
    expect(requestExport).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(requestExport).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: messages.requestNew }),
    );
    expect(requestExport).toHaveBeenCalledTimes(2);
  });

  it("keeps a rate-limited action disabled until its local wait ends", async () => {
    vi.useFakeTimers();
    const requestExport = vi.fn().mockResolvedValue({
      status: "rate_limited",
      retryAfter: 2,
    });
    render(
      <DataExportPanel
        locale="en"
        authorizationState={{ status: "absent" }}
        callbackNotice={null}
        csrfToken="proof"
        messages={messages}
        requestExport={requestExport}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: messages.request }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(
      screen.getByRole("button", { name: messages.requestNew }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("2 seconds");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("1 seconds");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("button", { name: messages.request })).toBeEnabled();
    expect(requestExport).toHaveBeenCalledOnce();
  });

  it("counts down from absolute expiry without noisy live ticks and restores focus", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
    render(
      <DataExportPanel
        locale="en"
        authorizationState={{
          status: "ready",
          expiresAt: "2026-08-23T12:00:02.000Z",
        }}
        callbackNotice={{ status: "ready", locale: "en" }}
        csrfToken="proof"
        messages={messages}
      />,
    );

    const downloadButton = screen.getByRole("button", {
      name: messages.download,
    });
    expect(screen.getByRole("status")).toHaveTextContent(messages.expiringSoon);
    expect(screen.getByText("Available for 0:02.")).toHaveAttribute(
      "aria-live",
      "off",
    );
    downloadButton.focus();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(messages.expired);
    expect(
      screen.getByRole("button", { name: messages.requestNew }),
    ).toHaveFocus();
    expect(screen.queryByRole("button", { name: messages.download })).toBeNull();
  });

  it("uses stable keyboard-safe controls and has no serious axe violations", async () => {
    const user = userEvent.setup();
    const requestExport = vi.fn().mockResolvedValue({ status: "sent" });
    const { container } = render(
      <DataExportPanel
        locale="ca"
        authorizationState={{ status: "absent" }}
        callbackNotice={null}
        csrfToken="proof"
        messages={messages}
        requestExport={requestExport}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2, name: messages.title });
    const button = screen.getByRole("button", { name: messages.request });
    expect(heading).toHaveAttribute("id", "personal-data-export-heading");
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("motion-reduce:transition-none");

    button.focus();
    await user.keyboard("{Enter}");
    expect(requestExport).toHaveBeenCalledOnce();
    const axeResult = await runAxeInJSDOM(container);
    expect(
      axeResult.violations.filter(({ impact }) =>
        impact === "critical" || impact === "serious",
      ),
    ).toEqual([]);
  });
});