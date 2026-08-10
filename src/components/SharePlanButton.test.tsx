// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Itinerary } from "@/lib/itinerary-types";

vi.mock("@/components/PlanShareSheet", () => ({
  PlanShareSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="share-sheet" /> : null,
}));

import { SharePlanButton } from "./SharePlanButton";

const itinerary = {
  departureUnix: 1000,
  arrivalUnix: 2000,
  totalDurationSec: 1000,
  transfers: 0,
  legs: [{ kind: "ride", routeShort: "101" }],
} as unknown as Itinerary;

const origin = { lat: 1, lng: 2, label: "Home" };
const destination = { lat: 3, lng: 4, label: "Work" };

describe("SharePlanButton", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "abc123" }) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts the plan and opens the share sheet on success", async () => {
    const user = userEvent.setup();
    render(<SharePlanButton itinerary={itinerary} origin={origin} destination={destination} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByTestId("share-sheet")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      "/api/public/plan-share",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a retry label after a failed request", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    const user = userEvent.setup();
    render(<SharePlanButton itinerary={itinerary} origin={origin} destination={destination} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    expect(screen.queryByTestId("share-sheet")).not.toBeInTheDocument();
  });
});
