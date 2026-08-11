// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfidenceIcon } from "./ConfidenceIcon";

describe("ConfidenceIcon", () => {
  // Setup registers jest-dom matchers only; each component suite tears its
  // own tree down so repeated renders cannot collide in the next query.
  afterEach(cleanup);

  it("has an accessible name derived from the confidence level", () => {
    render(<ConfidenceIcon confidence="high" />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/high/i);
  });

  it("reveals the tooltip on hover and hides it again when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<ConfidenceIcon confidence="medium" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.unhover(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("reveals the tooltip on keyboard focus so it is not hover-only", async () => {
    const user = userEvent.setup();
    render(<ConfidenceIcon confidence="low" />);
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("toggles with Enter while focused", async () => {
    const user = userEvent.setup();
    render(<ConfidenceIcon confidence="low" />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("labels every confidence level distinctly", () => {
    const { unmount } = render(<ConfidenceIcon confidence="low" />);
    const low = screen.getByRole("button").getAttribute("aria-label");
    unmount();
    render(<ConfidenceIcon confidence="high" />);
    const high = screen.getByRole("button").getAttribute("aria-label");
    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    expect(low).not.toBe(high);
  });
});
