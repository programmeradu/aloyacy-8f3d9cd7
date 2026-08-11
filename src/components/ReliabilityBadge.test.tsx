// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReliabilityBadge } from "./ReliabilityBadge";

describe("ReliabilityBadge", () => {
  // Setup registers jest-dom matchers only; each component suite tears its
  // own tree down so repeated renders cannot collide in the next query.
  afterEach(cleanup);

  it("compact: shows on-time percentage headline when rated", () => {
    render(<ReliabilityBadge tier="high" onTimePct={92} meanDelaySec={10} sampleCount={120} />);
    expect(screen.getByText(/92/)).toBeInTheDocument();
  });

  it("compact: shows 'not enough data' copy for unknown tier", () => {
    render(<ReliabilityBadge tier="unknown" onTimePct={0} meanDelaySec={0} sampleCount={0} />);
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("stack: shows the percentage headline and a sample-independent hint", () => {
    render(
      <ReliabilityBadge
        tier="low"
        onTimePct={40}
        meanDelaySec={400}
        sampleCount={50}
        variant="stack"
      />,
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("stack: renders em dash placeholder when unrated", () => {
    render(
      <ReliabilityBadge
        tier="unknown"
        onTimePct={0}
        meanDelaySec={0}
        sampleCount={0}
        variant="stack"
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("stack: distinguishes early vs late summaries via title on compact", () => {
    const { container: lateContainer } = render(
      <ReliabilityBadge tier="medium" onTimePct={70} meanDelaySec={200} sampleCount={40} />,
    );
    const lateTitle = lateContainer.querySelector("[title]")?.getAttribute("title");
    expect(lateTitle).toMatch(/late/i);
  });
});
