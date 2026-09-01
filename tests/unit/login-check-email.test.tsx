import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginCheckEmail } from "@/modules/login/components/login-check-email";

const messages = {
  title: "Check your email",
  description:
    "We've sent you a temporary login link. Please check your inbox at {email}.",
  enterCode: "Enter code manually",
  backToLogin: "Back to login",
};

function renderStep(email = "person@example.test") {
  const onEnterCode = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <LoginCheckEmail
      email={email}
      messages={messages}
      onEnterCode={onEnterCode}
      onBack={onBack}
    />,
  );
  return { ...view, onEnterCode, onBack };
}

describe("LoginCheckEmail", () => {
  it("states that a temporary link was sent without claiming delivery", () => {
    renderStep();

    expect(
      screen.getByRole("heading", { name: messages.title }),
    ).toBeVisible();
    expect(
      screen.getByText(/temporary login link/i),
    ).toBeVisible();
    expect(screen.queryByText(/delivered|sent successfully/i)).not.toBeInTheDocument();
  });

  it("emphasizes the address that was entered", () => {
    renderStep("someone@example.test");

    const address = screen.getByText("someone@example.test");
    expect(address.tagName).toBe("STRONG");
    expect(screen.queryByText("{email}")).not.toBeInTheDocument();
  });

  it("offers manual code entry as the primary action and a way back", async () => {
    const { onEnterCode, onBack } = renderStep();
    const buttons = screen.getAllByRole("button");

    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName(messages.enterCode);
    expect(buttons[1]).toHaveAccessibleName(messages.backToLogin);

    await userEvent.click(buttons[0]!);
    expect(onEnterCode).toHaveBeenCalledOnce();
    await userEvent.click(buttons[1]!);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("moves focus to its heading when the step opens", () => {
    renderStep();

    expect(screen.getByRole("heading", { name: messages.title })).toHaveFocus();
  });

  it("renders identically for any address, revealing nothing about the account", () => {
    const { container: known } = renderStep("known@example.test");
    const knownMarkup = known.innerHTML.replaceAll("known@example.test", "ADDRESS");
    const { container: unknown } = renderStep("unknown@example.test");
    const unknownMarkup = unknown.innerHTML.replaceAll(
      "unknown@example.test",
      "ADDRESS",
    );

    expect(unknownMarkup).toBe(knownMarkup);
  });
});
