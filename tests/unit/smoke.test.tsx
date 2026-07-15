import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

describe("test setup", () => {
  it("renders with jsdom + jest-dom matchers", () => {
    render(<Hello name="World" />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });
});
