// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTrackingDecision } from "../tracking";

describe("hook smoke", () => {
  it("works", async () => {
    const { result } = renderHook(() => useTrackingDecision(false));
    expect(result.current.status).toBe("unknown");
    await waitFor(() => expect(result.current.status).not.toBe("unknown"));
  });
});
