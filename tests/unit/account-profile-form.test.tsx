import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfileForm } from "@/modules/account/components/profile-form";
import type { ProfileActionState } from "@/modules/account/types";

const messages = {
  profileHeading: "Profile",
  profileDescription: "Update your name while keeping your account email read-only.",
  avatarLabel: "Profile image",
  avatarImageAlt: "Current profile image",
  nameLabel: "Name",
  nameDescription: "Use your real name.",
  emailLabel: "Email",
  emailDescription: "This email is used to access your account.",
  saveIdle: "Save changes",
  savePending: "Saving...",
  pendingAnnouncement: "Saving your changes...",
  saved: "Changes saved.",
  saveFailed: "We could not save your changes.",
  required: "Enter your name.",
  tooLong: "Name must be 80 characters or fewer.",
  invalidCharacters: "Use letters, spaces, apostrophes, or hyphens.",
  invalidSubmission: "Invalid submission.",
};

describe("ProfileForm", () => {
  it("renders image avatar state, editable name, and read-only email", () => {
    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria",
          email: "maria@example.test",
          image: "https://cdn.example.test/maria.png",
        }}
        messages={messages}
        action={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: messages.avatarImageAlt })).toBeVisible();
    expect(screen.getByRole("textbox", { name: messages.nameLabel })).toBeEnabled();
    const emailField = screen.getByRole("textbox", { name: messages.emailLabel });
    expect(emailField).toHaveValue("maria@example.test");
    expect(emailField).toHaveAttribute("readonly");
    expect(emailField).toHaveClass("read-only:bg-muted", "read-only:cursor-default");
    expect(screen.getByText(messages.emailDescription)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.saveIdle })).toBeVisible();
  });

  it("renders fallback initials when no image is available", () => {
    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria Soler",
          email: "maria@example.test",
          image: null,
        }}
        messages={messages}
        action={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(messages.avatarLabel)).toHaveTextContent("MS");
  });

  it("suppresses duplicate submits while pending and announces success", async () => {
    let resolveAction:
      | ((state: ProfileActionState) => void)
      | undefined;
    const action = vi.fn(
      () =>
        new Promise<ProfileActionState>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria",
          email: "maria@example.test",
          image: null,
        }}
        messages={messages}
        action={action}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: messages.nameLabel });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated Name");
    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));

    expect(screen.getByRole("button", { name: messages.savePending })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: messages.savePending }));
    expect(action).toHaveBeenCalledOnce();

    resolveAction?.({ status: "success", name: "Updated Name", message: "saved" });
    await waitFor(() => {
      expect(screen.getByText(messages.saved)).toBeVisible();
    });
  });

  it("announces validation errors, retains value, and focuses the name field", async () => {
    const action = vi.fn().mockResolvedValue({
      status: "validation_error",
      name: "",
      field: "name",
      message: "required",
    });

    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria",
          email: "maria@example.test",
          image: null,
        }}
        messages={messages}
        action={action}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: messages.nameLabel });
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));

    expect(await screen.findByText(messages.required)).toBeVisible();
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveValue("");
  });

  it("announces persistence errors, retains value, and keeps submit focus", async () => {
    const action = vi.fn().mockResolvedValue({
      status: "persistence_error",
      name: "Updated Name",
      message: "save_failed",
    });

    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria",
          email: "maria@example.test",
          image: null,
        }}
        messages={messages}
        action={action}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: messages.nameLabel });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated Name");
    const submitButton = screen.getByRole("button", { name: messages.saveIdle });
    await userEvent.click(submitButton);

    expect(await screen.findByText(messages.saveFailed)).toBeVisible();
    expect(nameInput).toHaveValue("Updated Name");
    await waitFor(() => expect(submitButton).toHaveFocus());
  });

  it("supports retry after persistence error without reload", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        status: "persistence_error",
        name: "Updated Name",
        message: "save_failed",
      })
      .mockResolvedValueOnce({
        status: "success",
        name: "Updated Name",
        message: "saved",
      });

    render(
      <ProfileForm
        locale="en"
        initialProfile={{
          name: "Maria",
          email: "maria@example.test",
          image: null,
        }}
        messages={messages}
        action={action}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: messages.nameLabel });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated Name");
    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));
    await screen.findByText(messages.saveFailed);

    await userEvent.click(screen.getByRole("button", { name: messages.saveIdle }));
    expect(await screen.findByText(messages.saved)).toBeVisible();
  });
});