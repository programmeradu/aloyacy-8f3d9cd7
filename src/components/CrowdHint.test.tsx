// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

const loadMock = vi.fn();
vi.mock("@/lib/crowd.functions", () => ({ getRouteLoad: (...a: unknown[]) => loadMock(...a) }));

const weatherMock = vi.fn();
vi.mock("@/lib/weather.functions", () => ({
  getCurrentWeather: (...a: unknown[]) => weatherMock(...a),
}));

vi.mock("@/lib/analytics", () => ({ track: vi.fn(), trackImpression: vi.fn() }));

import { CrowdHint } from "./CrowdHint";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CrowdHint", () => {
  // Setup registers jest-dom matchers only; each component suite tears its
  // own tree down so repeated renders cannot collide in the next query.
  afterEach(cleanup);

  beforeEach(() => {
    loadMock.mockReset();
    weatherMock.mockReset();
  });

  it("renders nothing while there is no crowd or weather signal", async () => {
    loadMock.mockResolvedValue({ level: undefined, sample: 0 });
    const { container } = renderWithClient(<CrowdHint routeId="r1" />);
    await waitFor(() => expect(loadMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the crowd level copy once loaded", async () => {
    loadMock.mockResolvedValue({ level: "busy", sample: 5 });
    renderWithClient(<CrowdHint routeId="r1" />);
    await waitFor(() => expect(screen.getByText(/busy/i)).toBeInTheDocument());
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("folds in a weather clause when weatherAt is provided", async () => {
    loadMock.mockResolvedValue({ level: "quiet", sample: 2 });
    weatherMock.mockResolvedValue({ iconKey: "rain", tempC: 18 });
    renderWithClient(<CrowdHint routeId="r1" weatherAt={{ lat: 1, lng: 2 }} />);
    await waitFor(() => expect(screen.getByText(/rain/i)).toBeInTheDocument());
  });

  it("renders weather-only copy when there is no crowd level", async () => {
    loadMock.mockResolvedValue({ level: undefined, sample: 0 });
    weatherMock.mockResolvedValue({ iconKey: "storm", tempC: 20 });
    renderWithClient(<CrowdHint routeId="r1" weatherAt={{ lat: 1, lng: 2 }} />);
    await waitFor(() => expect(screen.getByText(/storm/i)).toBeInTheDocument());
  });
});
