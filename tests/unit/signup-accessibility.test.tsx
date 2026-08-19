import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

import { SignupForm } from "@/modules/signup/components/signup-form";
import { runAxeInJSDOM } from "../helpers/axe";

const messages = {
  ariaLabel: "Email signup form",
  nameLabel: "Name",
  namePlaceholder: "Taylor Example",
  nameDescription: "Use letters, spaces, apostrophes, or hyphens.",
  emailLabel: "Email",
  emailPlaceholder: "name@example.com",
  emailDescription: "Use an email address you can open now.",
  policyLabelPrefix: "I accept the",
  policyTerms: "terms of use",
  policyAnd: "and",
  policyPrivacy: "privacy notice",
  policyDescription: "Required to create an account.",
  invalidNameRequired: "Enter your name.",
  invalidNameTooLong: "Name must be 80 characters or fewer.",
  invalidNameCharacters: "Use letters, spaces, apostrophes, or hyphens only.",
  invalidEmail: "Enter a valid email address.",
  invalidPolicy: "Accept the terms of use and privacy notice to continue.",
  invalidRequest: "Refresh the page and try again.",
  submitIdle: "Create account",
  submitPending: "Sending...",
  sending: "Sending your request...",
  accepted: "Check your email for the next step.",
  unavailable: "Signup is temporarily unavailable.",
  rateLimited: "Try again in {seconds} seconds.",
  loginPrompt: "Already have an account?",
  login: "Sign in",
  invalidLinkTitle: "This signup link is not valid",
  invalidLinkDescription: "Request a new signup email and use the latest link.",
  invalidLinkAction: "Request a new signup email",
  sessionConflictTitle: "Sign out before using this link",
  sessionConflictDescription: "Your current session was preserved.",
  sessionConflictAction: "Sign out",
  sessionFailedTitle: "Your account is ready",
  sessionFailedDescription: "We could not start your session.",
  sessionFailedAction: "Sign in",
};

function renderForm(fetcher: typeof fetch = vi.fn()) {
  return render(
    <SignupForm
      locale="en"
      csrfToken="csrf"
      policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
      messages={messages}
      fetcher={fetcher}
    />,
  );
}

async function expectNoSeriousAxeViolations(container: HTMLElement) {
  const result = await runAxeInJSDOM(container);
  const seriousOrCritical = result.violations.filter((violation) =>
    violation.nodes.some((node) =>
      ["serious", "critical"].includes(node.impact ?? ""),
    ),
  );
  expect(seriousOrCritical).toEqual([]);
}

describe("SignupForm accessibility", () => {
  it("has explicit labels, descriptions, a native unchecked checkbox, and no serious axe violations", async () => {
    const { container } = renderForm();
    const name = screen.getByRole("textbox", { name: messages.nameLabel });
    const email = screen.getByRole("textbox", { name: messages.emailLabel });
    const policy = screen.getByRole("checkbox");

    expect(name).toHaveAccessibleDescription(`${messages.nameDescription} `);
    expect(email).toHaveAccessibleDescription(`${messages.emailDescription} `);
    expect(policy.tagName).toBe("INPUT");
    expect(policy).toHaveAttribute("type", "checkbox");
    expect(policy).not.toBeChecked();
    expect(policy).toHaveAccessibleDescription(`${messages.policyDescription} `);
    await expectNoSeriousAxeViolations(container);
  });

  it("uses at least 24px control targets and visible focus styles", () => {
    renderForm();
    const name = screen.getByRole("textbox", { name: messages.nameLabel });
    const email = screen.getByRole("textbox", { name: messages.emailLabel });
    const policy = screen.getByRole("checkbox");
    const submit = screen.getByRole("button", { name: messages.submitIdle });

    expect(name).toHaveClass("h-8", "focus-visible:ring-3");
    expect(email).toHaveClass("h-8", "focus-visible:ring-3");
    expect(policy).toHaveClass("size-6", "focus-visible:ring-[3px]");
    expect(submit).toHaveClass("h-8", "focus-visible:ring-3");
  });

  it("follows logical keyboard order through fields, policy links, and submit", async () => {
    renderForm();
    const user = userEvent.setup();
    const name = screen.getByRole("textbox", { name: messages.nameLabel });
    const email = screen.getByRole("textbox", { name: messages.emailLabel });
    const policy = screen.getByRole("checkbox");

    await user.tab();
    expect(name).toHaveFocus();
    await user.tab();
    expect(email).toHaveFocus();
    await user.tab();
    expect(policy).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: messages.policyTerms })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: messages.policyPrivacy })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: messages.submitIdle })).toHaveFocus();
  });

  it("announces field errors urgently and focuses the first invalid field", async () => {
    const { container } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    const nameError = screen.getByText(messages.invalidNameRequired);
    expect(nameError).toHaveAttribute("role", "alert");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: messages.nameLabel })).toHaveFocus();
    });
    await expectNoSeriousAxeViolations(container);
  });

  it("uses polite pending feedback and assertive service recovery", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderForm(fetcher);

    await userEvent.type(screen.getByRole("textbox", { name: messages.nameLabel }), "Taylor Example");
    await userEvent.type(screen.getByRole("textbox", { name: messages.emailLabel }), "person@example.test");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent(messages.sending);
    resolveRequest?.(Response.json({ status: "invalid_request" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
      expect(screen.getByRole("alert")).toHaveTextContent(messages.invalidRequest);
    });
  });
});