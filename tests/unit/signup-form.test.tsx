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
  sessionConflictDescription: "Your current session was preserved. Sign out, then reopen the email link.",
  sessionConflictAction: "Sign out",
  sessionFailedTitle: "Your account is ready",
  sessionFailedDescription: "We could not start your session. Sign in with your verified email.",
  sessionFailedAction: "Sign in",
};

describe("SignupForm core flow", () => {
  it("renders only name, email, and one unchecked policy control", () => {
    render(
      <SignupForm
        locale="en"
        csrfToken="csrf"
        policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
        messages={messages}
      />,
    );

    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("link", { name: messages.policyTerms })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: messages.policyPrivacy })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("submits normalized exact JSON once and shows the generic confirmation", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(
      <SignupForm
        locale="es"
        csrfToken="csrf"
        policyDestinations={{ terms: "/es/terms", privacy: "/es/privacy" }}
        messages={messages}
        fetcher={fetcher}
      />,
    );

    await userEvent.type(screen.getByLabelText(messages.nameLabel), "  José O’Neil  ");
    await userEvent.type(screen.getByLabelText(messages.emailLabel), " Person@Example.COM ");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(messages.sending);
    await userEvent.click(screen.getByRole("button"));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "José O’Neil",
        email: "person@example.com",
        policyAccepted: true,
        locale: "es",
        csrfToken: "csrf",
      }),
    });

    resolveRequest?.(Response.json({ status: "accepted" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(messages.accepted);
      expect(screen.getByRole("button")).toBeEnabled();
    });
  });

  it("shows every client field error and focuses the first invalid control", async () => {
    render(
      <SignupForm
        locale="en"
        csrfToken="csrf"
        policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
        messages={messages}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    expect(screen.getByText(messages.invalidNameRequired)).toBeVisible();
    expect(screen.getByText(messages.invalidEmail)).toBeVisible();
    expect(screen.getByText(messages.invalidPolicy)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText(messages.nameLabel)).toHaveFocus());
  });

  it("maps a server field error and focuses that field", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ status: "invalid", field: "email" }),
    );
    render(
      <SignupForm
        locale="en"
        csrfToken="csrf"
        policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
        messages={messages}
        fetcher={fetcher}
      />,
    );

    await userEvent.type(screen.getByLabelText(messages.nameLabel), "Taylor Example");
    await userEvent.type(screen.getByLabelText(messages.emailLabel), "person@example.test");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    await waitFor(() => {
      expect(screen.getByText(messages.invalidEmail)).toBeVisible();
      expect(screen.getByLabelText(messages.emailLabel)).toHaveFocus();
    });
  });

  it.each([
    [{ status: "invalid_request" }, messages.invalidRequest, "alert"],
    [{ status: "rate_limited", retryAfter: 47 }, "Try again in 47 seconds.", "status"],
    [{ status: "unavailable" }, messages.unavailable, "alert"],
  ] as const)(
    "maps the $result.status response to its recovery live region",
    async (result, expectedMessage, role) => {
      const fetcher = vi.fn().mockResolvedValue(Response.json(result));
      render(
        <SignupForm
          locale="en"
          csrfToken="csrf"
          policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
          messages={messages}
          fetcher={fetcher}
        />,
      );

      await userEvent.type(screen.getByLabelText(messages.nameLabel), "Taylor Example");
      await userEvent.type(screen.getByLabelText(messages.emailLabel), "person@example.test");
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

      await waitFor(() => {
        expect(screen.getByRole(role)).toHaveTextContent(expectedMessage);
        expect(screen.getByRole("button")).toBeEnabled();
      });
    },
  );

  it("maps a request failure to the urgent unavailable state", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network unavailable"));
    render(
      <SignupForm
        locale="en"
        csrfToken="csrf"
        policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
        messages={messages}
        fetcher={fetcher}
      />,
    );

    await userEvent.type(screen.getByLabelText(messages.nameLabel), "Taylor Example");
    await userEvent.type(screen.getByLabelText(messages.emailLabel), "person@example.test");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: messages.submitIdle }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.unavailable);
    });
  });

  it.each([
    ["en", "/login", "Already have an account?", "Sign in"],
    ["es", "/login", "¿Ya tienes una cuenta?", "Inicia sesión"],
    ["ca", "/login", "Ja tens un compte?", "Inicia sessió"],
  ] as const)(
    "keeps the %s existing-account prompt localized and free of submitted PII",
    async (locale, loginPath, loginPrompt, login) => {
      render(
        <SignupForm
          locale={locale}
          csrfToken="csrf"
          loginPath={loginPath}
          policyDestinations={{
            terms: "/terms",
            privacy: "/privacy",
          }}
          messages={{ ...messages, loginPrompt, login }}
          fetcher={vi.fn()}
        />,
      );

      const submittedName = "Private Person";
      const submittedEmail = "private@example.test";
      await userEvent.type(screen.getByLabelText(messages.nameLabel), submittedName);
      await userEvent.type(screen.getByLabelText(messages.emailLabel), submittedEmail);

      expect(screen.getByText(loginPrompt)).toBeVisible();
      const link = screen.getByRole("link", { name: login });
      expect(link).toHaveAttribute("href", loginPath);
      expect(link.getAttribute("href")).not.toContain(encodeURIComponent(submittedName));
      expect(link.getAttribute("href")).not.toContain(encodeURIComponent(submittedEmail));
      expect(link.getAttribute("href")).not.toContain("?");
    },
  );

  it.each([
    ["invalid_link", messages.invalidLinkTitle, messages.invalidLinkAction],
    ["session_conflict", messages.sessionConflictTitle, messages.sessionConflictAction],
    ["session_failed", messages.sessionFailedTitle, messages.sessionFailedAction],
  ] as const)("renders the %s recovery state without account details", (recoveryState, title, action) => {
    render(
      <SignupForm
        locale="en"
        recoveryState={recoveryState}
        loginPath="/login"
        policyDestinations={{ terms: "/terms", privacy: "/privacy" }}
        messages={messages}
      />,
    );

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByRole("link", { name: action })).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});