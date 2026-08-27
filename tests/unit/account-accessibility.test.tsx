import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfileForm } from "@/modules/account/components/profile-form";
import { runAxeInJSDOM } from "../helpers/axe";

const messages = {
  profileHeading: "Profile",
  profileDescription: "Update your name while keeping your account email read-only.",
  avatarLabel: "Profile avatar",
  avatarImageAlt: "Current profile image",
  nameLabel: "Name",
  nameDescription: "Use your real name.",
  emailLabel: "Email",
  emailDescription: "This email is used to access your account.",
  saveIdle: "Save changes",
  savePending: "Saving...",
  pendingAnnouncement: "Saving your changes...",
  saved: "Changes saved.",
  saveFailed: "We could not save your profile.",
  required: "Enter your name.",
  tooLong: "Name must be 80 characters or fewer.",
  invalidCharacters: "Use letters, spaces, apostrophes, or hyphens.",
  invalidSubmission: "Invalid submission.",
};

async function expectNoAxeViolations(container: HTMLElement) {
  const result = await runAxeInJSDOM(container);
  const seriousOrCritical = result.violations.filter((violation) =>
    violation.nodes.some((node) => ["serious", "critical"].includes(node.impact ?? "")),
  );
  expect(seriousOrCritical).toEqual([]);
}

describe("account profile accessibility", () => {
  it("supports explicit labels, read-only semantics, and keyboard order", async () => {
    const { container } = render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria Soler",
          email: "maria@example.test",
          image: null,
        }}
        messages={messages}
        action={vi.fn().mockResolvedValue({ status: "success", name: "Maria Soler", message: "saved" })}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: messages.nameLabel });
    const emailInput = screen.getByRole("textbox", { name: messages.emailLabel });
    expect(emailInput).toHaveAttribute("readonly");
    expect(screen.getByLabelText(messages.avatarLabel)).toHaveTextContent("MS");

    await userEvent.tab();
    expect(nameInput).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: messages.saveIdle })).toHaveFocus();

    await expectNoAxeViolations(container);
  });

  it("announces validation and persistence failures through assertive live regions", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        status: "validation_error",
        name: "",
        field: "name",
        message: "required",
      })
      .mockResolvedValueOnce({
        status: "persistence_error",
        name: "Retry Name",
        message: "save_failed",
      })
      .mockResolvedValueOnce({
        status: "success",
        name: "Retry Name",
        message: "saved",
      });

    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria",
          email: "maria@example.test",
          image: "https://cdn.example.test/avatar.png",
        }}
        messages={messages}
        action={action}
      />,
    );

    await userEvent.clear(screen.getByRole("textbox", { name: messages.nameLabel }));
    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));
    const validationMessage = await screen.findByText(messages.required);
    expect(validationMessage).toBeVisible();
    expect(validationMessage.closest('[role="alert"]')).toHaveAttribute("role", "alert");

    await userEvent.type(screen.getByRole("textbox", { name: messages.nameLabel }), "Retry Name");
    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));
    const persistenceMessage = await screen.findByText(messages.saveFailed);
    expect(persistenceMessage.closest("p")).toHaveAttribute("role", "alert");

    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));
    await waitFor(() => {
      const success = screen.getByText(messages.saved);
      expect(success.closest("p")).toHaveAttribute("role", "status");
    });
  });
});