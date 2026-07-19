import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="next-themes-provider">{children}</div>
  ),
}));

import { ThemeProvider } from "@/components/theme-provider";

describe("ThemeProvider", () => {
  it("renders children through next-themes", () => {
    render(
      <ThemeProvider attribute="class">
        <span>Theme content</span>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("next-themes-provider")).toContainElement(
      screen.getByText("Theme content"),
    );
  });
});