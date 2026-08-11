// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DisruptionSignal } from "@/lib/useDisruptionWatch";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

const trackMock = vi.fn();
const trackImpressionMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  track: (...a: unknown[]) => trackMock(...a),
  trackImpression: (...a: unknown[]) => trackImpressionMock(...a),
}));

import { DisruptionBanner } from "./DisruptionBanner";

function signal(overrides: Partial<DisruptionSignal> = {}): DisruptionSignal {
  return {
    kind: "running-late",
    slipMin: 6,
    title: "Running behind",
    body: "Your bus is 6 minutes late.",
    suggestReplan: false,
    ...overrides,
  };
}

describe("DisruptionBanner", () => {
  // Setup registers jest-dom matchers only; each component suite tears its
  // own tree down so repeated renders cannot collide in the next query.
  afterEach(cleanup);

  beforeEach(() => {
    navigateMock.mockReset();
    trackMock.mockReset();
    trackImpressionMock.mockReset();
  });

  it("renders nothing when there is no signal", () => {
    const { container } = render(<DisruptionBanner signal={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title and body for a signal", () => {
    render(<DisruptionBanner signal={signal()} />);
    expect(screen.getByText("Running behind")).toBeInTheDocument();
    expect(screen.getByText("Your bus is 6 minutes late.")).toBeInTheDocument();
  });

  it("hides the replan CTA when suggestReplan is false", () => {
    render(<DisruptionBanner signal={signal({ suggestReplan: false })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the replan CTA and calls onReplan when provided", async () => {
    const user = userEvent.setup();
    const onReplan = vi.fn();
    render(<DisruptionBanner signal={signal({ suggestReplan: true })} onReplan={onReplan} />);
    await user.click(screen.getByRole("button"));
    expect(onReplan).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("falls back to navigating to /trips when no onReplan is given", async () => {
    const user = userEvent.setup();
    render(<DisruptionBanner signal={signal({ suggestReplan: true })} />);
    await user.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/trips" });
  });

  it("fires an impression on mount", () => {
    render(<DisruptionBanner signal={signal()} />);
    expect(trackImpressionMock).toHaveBeenCalled();
  });
});
