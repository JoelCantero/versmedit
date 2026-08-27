import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/modules/login/components/login-form";
import { runAxeInJSDOM } from "../helpers/axe";

const messages = {
  ariaLabel: "Email sign-in form",
  emailLabel: "Email",
  emailPlaceholder: "name@example.com",
  emailDescription: "Use the address associated with your account.",
  invalidEmail: "Enter a valid email address.",
  submitIdle: "Send sign-in link",
  submitPending: "Sending...",
  sending: "Sending your sign-in link...",
  accepted: "If an account exists, a link will arrive.",
  invalidRequest: "Refresh and try again.",
  unavailable: "Email sign-in is temporarily unavailable.",
  rateLimited: "Try again in {seconds} seconds.",
};

async function expectNoAxeViolations(container: HTMLElement) {
  const result = await runAxeInJSDOM(container);
  expect(result.violations).toEqual([]);
}

describe("LoginForm accessibility", () => {
  it("has no automated violations and associates its only field", async () => {
    const { container } = render(
      <LoginForm
        locale="en"
        callbackUrl="/"
        csrfToken="csrf"
        messages={messages}
      />,
    );
    const input = screen.getByRole("textbox", { name: messages.emailLabel });
    expect(input).toHaveAccessibleDescription(messages.emailDescription);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it("announces and associates invalid input without axe violations", async () => {
    const { container } = render(
      <LoginForm
        locale="en"
        callbackUrl="/"
        csrfToken="csrf"
        messages={messages}
        fetcher={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "invalid");
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      `${messages.emailDescription} ${messages.invalidEmail}`,
    );
    await expectNoAxeViolations(container);
  });

  it("submits by keyboard, announces pending, and disables controls", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    render(
      <LoginForm
        locale="en"
        callbackUrl="/"
        csrfToken="csrf"
        messages={messages}
        fetcher={fetcher}
      />,
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "person@example.test");
    await userEvent.keyboard("{Enter}");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(messages.sending)).toHaveAttribute("role", "status");

    resolveRequest?.(Response.json({ status: "accepted" }));
    await waitFor(() => expect(screen.getByText(messages.accepted)).toBeVisible());
  });
});