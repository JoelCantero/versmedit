import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginCodeForm } from "@/modules/login/components/login-code-form";

const messages = {
  title: "Enter your login code",
  description: "Type or paste the 10-character code from the email.",
  fieldLabel: "Login code",
  fieldDescription: "Letters and numbers, exactly as in the email.",
  submitIdle: "Sign in",
  submitPending: "Checking...",
  invalidCode: "That code is not valid.",
  invalidRequest: "Refresh the page and try again.",
  unavailable: "Email sign-in is temporarily unavailable.",
  rateLimited: "Try again in {seconds} seconds.",
  backToLogin: "Back to login",
};

function renderForm(overrides: Partial<Parameters<typeof LoginCodeForm>[0]> = {}) {
  const props = {
    email: "person@example.test",
    locale: "es",
    callbackUrl: "/es/account",
    messages,
    onBack: vi.fn(),
    csrfToken: "csrf",
    fetcher: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
  return { ...render(<LoginCodeForm {...props} />), props };
}

describe("LoginCodeForm", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("exposes one labelled field and moves focus to its heading", () => {
    renderForm();

    const input = screen.getByRole("textbox", { name: messages.fieldLabel });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAccessibleDescription(messages.fieldDescription);
    expect(screen.getByRole("heading", { name: messages.title })).toHaveFocus();
  });

  it("submits a pasted lower-case hyphenated code normalized by the server contract", async () => {
    const fetcher = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => Response.json({ status: "accepted", redirectTo: "/es/account" }));
    const navigate = vi.fn();
    renderForm({ fetcher, navigate });

    await userEvent.type(
      screen.getByRole("textbox"),
      "  7k2qm-9xptr  ",
    );
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/es/account"));
    const [, init] = fetcher.mock.calls[0]!;
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("code")).toBe("  7k2qm-9xptr  ");
    expect(body.get("email")).toBe("person@example.test");
    expect(body.get("locale")).toBe("es");
    expect(body.get("callbackUrl")).toBe("/es/account");
    expect(body.get("csrfToken")).toBe("csrf");
  });

  it.each([
    [{ status: "invalid_code" }, messages.invalidCode],
    [{ status: "rate_limited", retryAfter: 42 }, "Try again in 42 seconds."],
    [{ status: "invalid_request" }, messages.invalidRequest],
    [{ status: "unavailable" }, messages.unavailable],
  ])("renders the generic message for %j", async (payload, expected) => {
    const navigate = vi.fn();
    renderForm({
      fetcher: vi.fn(async () => Response.json(payload)),
      navigate,
    });

    await userEvent.type(screen.getByRole("textbox"), "7K2QM9XPTR");
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    expect(await screen.findByText(expected)).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("marks the field invalid and associates the generic failure with it", async () => {
    renderForm({
      fetcher: vi.fn(async () => Response.json({ status: "invalid_code" })),
    });

    await userEvent.type(screen.getByRole("textbox"), "7K2QM9XPTR");
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      `${messages.fieldDescription} ${messages.invalidCode}`,
    );
  });

  it("disables the control while the submission is in flight", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderForm({ fetcher });

    await userEvent.type(screen.getByRole("textbox"), "7K2QM9XPTR");
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    expect(screen.getByRole("button", { name: messages.submitPending })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();

    resolveRequest?.(Response.json({ status: "invalid_code" }));
    await screen.findByText(messages.invalidCode);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns to the email step without submitting", async () => {
    const onBack = vi.fn();
    const fetcher = vi.fn();
    renderForm({ onBack, fetcher });

    await userEvent.click(screen.getByRole("button", { name: messages.backToLogin }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
