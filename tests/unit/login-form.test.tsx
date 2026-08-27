import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/modules/login/components/login-form";

const messages = {
  ariaLabel: "Email sign-in form",
  emailLabel: "Email",
  emailPlaceholder: "name@example.com",
  emailDescription: "Use the address associated with your account.",
  invalidEmail: "Enter a valid email address.",
  submitIdle: "Send sign-in link",
  submitPending: "Sending...",
  sending: "Sending your sign-in link...",
  accepted: "If an account exists for this address, you will receive a link to sign in.",
  invalidRequest: "Refresh the page and try again.",
  unavailable: "Email sign-in is temporarily unavailable.",
  rateLimited: "Try again in {seconds} seconds.",
};

describe("LoginForm", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders only one email field and one primary action", () => {
    render(
      <LoginForm
        locale="en"
        callbackUrl="/account"
        csrfToken="csrf"
        messages={messages}
      />,
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-describedby",
      "login-email-description",
    );
    expect(document.querySelector('[data-slot="field-error"]')).not.toBeInTheDocument();
  });

  it("validates email without sending a request", async () => {
    const fetchMock = vi.fn();
    render(
      <LoginForm
        locale="en"
        callbackUrl="/account"
        csrfToken="csrf"
        messages={messages}
        fetcher={fetchMock}
      />,
    );

    await userEvent.type(screen.getByRole("textbox"), "not-an-email");
    await userEvent.click(screen.getByRole("button"));

    const error = await screen.findByText(messages.invalidEmail);
    expect(error).toBeVisible();
    expect(error).toHaveAttribute("data-slot", "field-error");
    expect(error.parentElement).toHaveClass("min-h-5");
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-describedby",
      "login-email-description login-email-error",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate submission and renders the exact accepted message", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(
      <LoginForm
        locale="en"
        callbackUrl="/account"
        csrfToken="csrf"
        messages={messages}
        fetcher={fetcher}
      />,
    );

    await userEvent.type(screen.getByRole("textbox"), "person@example.com");
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(document.querySelector('[data-slot="spinner"]')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(fetcher).toHaveBeenCalledOnce();

    resolveRequest?.(Response.json({ status: "accepted" }));
    await waitFor(() => expect(screen.getByText(messages.accepted)).toBeVisible());
  });

  it.each([
    [{ status: "invalid_request" }, messages.invalidRequest],
    [{ status: "rate_limited", retryAfter: 17 }, "Try again in 17 seconds."],
    [{ status: "unavailable" }, messages.unavailable],
  ])("renders the failure contract %#", async (payload, expectedMessage) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
    render(
      <LoginForm
        locale="en"
        callbackUrl="/account"
        csrfToken="csrf"
        messages={messages}
        fetcher={fetcher}
      />,
    );
    await userEvent.type(screen.getByRole("textbox"), "person@example.com");
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(expectedMessage)).toBeVisible();
  });

  it("submits the validated callback path unchanged", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "csrf" }))
      .mockResolvedValueOnce(Response.json({ status: "accepted" }));

    render(
      <LoginForm
        locale="en"
        callbackUrl="/account"
        messages={messages}
        fetcher={fetcher}
      />,
    );

    await userEvent.type(screen.getByRole("textbox"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    const signinRequest = fetcher.mock.calls.at(-1);
    expect(signinRequest?.[0]).toBe("/api/auth/signin/email");
    expect(String(signinRequest?.[1]?.body)).toContain("callbackUrl=%2Faccount");
  });
});