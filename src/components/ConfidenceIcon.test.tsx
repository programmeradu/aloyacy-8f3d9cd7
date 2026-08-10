// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfidenceIcon } from "./ConfidenceIcon";

describe("ConfidenceIcon", () => {
  it("has an accessible name derived from the confidence level", () => {
    render(<ConfidenceIcon confidence="high" />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/high/i);
  });

  it("shows the tooltip on click and hides it again on second click", async () => {
    const user = userEvent.setup();
    render(<ConfidenceIcon confidence="medium" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard activation (Enter)", async () => {
    const user = userEvent.setup();
    render(<ConfidenceIcon confidence="low" />);
    const btn = screen.getByRole("button");
    btn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
