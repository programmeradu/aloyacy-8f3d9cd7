// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EtaPill, type EtaPillData } from "./EtaPill";

function base(overrides: Partial<EtaPillData> = {}): EtaPillData {
  return { etaMin: 8, tier: "live", confidence: "high", ...overrides };
}

describe("EtaPill", () => {
  // Setup registers jest-dom matchers only; each component suite tears its
  // own tree down so repeated renders cannot collide in the next query.
  afterEach(cleanup);

  it("headline: shows the number and minute label", () => {
    render(<EtaPill data={base()} variant="headline" />);
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("headline: ghost tier renders em dash and no minute label", () => {
    render(<EtaPill data={base({ tier: "ghost", etaMin: null })} variant="headline" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/min/i)).not.toBeInTheDocument();
  });

  it("headline: shows struck-through operator eta when it disagrees", () => {
    render(<EtaPill data={base({ etaMin: 8, operatorEtaMin: 5 })} variant="headline" />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("headline: does not show operator eta line when it matches", () => {
    render(<EtaPill data={base({ etaMin: 8, operatorEtaMin: 8 })} variant="headline" />);
    // Only the "8" headline number should be present, no strike-through line
    expect(screen.getAllByText("8")).toHaveLength(1);
  });

  it("headline: renders an informative band", () => {
    render(<EtaPill data={base({ etaMin: 8, band: "3–15 min" })} variant="headline" />);
    expect(screen.getByText("3–15 min")).toBeInTheDocument();
  });

  it("headline: suppresses a band that is redundant with the headline number", () => {
    render(<EtaPill data={base({ etaMin: 8, band: "8–9 min" })} variant="headline" />);
    expect(screen.queryByText("8–9 min")).not.toBeInTheDocument();
  });

  it("headline: shows a blurb when provided", () => {
    render(<EtaPill data={base({ blurb: "usually 2 min late" })} variant="headline" />);
    expect(screen.getByText("usually 2 min late")).toBeInTheDocument();
  });

  it("compact: renders the confidence icon only for live/rider-confirmed/predicted", () => {
    const { rerender } = render(<EtaPill data={base({ tier: "live" })} variant="compact" />);
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<EtaPill data={base({ tier: "scheduled" })} variant="compact" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stack: renders eta number and no min label for ghost", () => {
    render(<EtaPill data={base({ tier: "ghost", etaMin: null })} variant="stack" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("names a lone reporter as one rider", () => {
    render(
      <EtaPill
        data={base({ tier: "rider-confirmed", singleSource: true, confidence: "low" })}
        variant="compact"
      />,
    );
    expect(screen.getByText(/one rider/i)).toBeInTheDocument();
  });
});
