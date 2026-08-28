// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SightingButton } from "./SightingButton";

vi.mock("@/lib/pwa", () => ({ getDeviceId: () => "device-abc" }));

describe("SightingButton", () => {
  // Setup registers jest-dom matchers only; each component suite tears its
  // own tree down so repeated renders cannot collide in the next query.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("posts a sighting and flips to the thanks state on click", async () => {
    const user = userEvent.setup();
    render(<SightingButton tripId="trip-1" lat={1} lng={2} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      "/api/public/sighting",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("restores the confirmed state from localStorage cooldown on mount", () => {
    localStorage.setItem("aloya.sighting.trip-2", String(Date.now()));
    render(<SightingButton tripId="trip-2" lat={1} lng={2} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not restore state once the cooldown has expired", () => {
    localStorage.setItem("aloya.sighting.trip-3", String(Date.now() - 120_000));
    render(<SightingButton tripId="trip-3" lat={1} lng={2} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("names a busy dark line without asking anyone to volunteer", () => {
    render(<SightingButton tripId="trip-4" lat={1} lng={2} kind="onboard" routeShort="40" needEyes />);
    expect(screen.getByText(/runs often and almost nobody is watching/i)).toBeInTheDocument();
    expect(screen.queryByText(/please|contribute|points|badge/i)).not.toBeInTheDocument();
  });
});
