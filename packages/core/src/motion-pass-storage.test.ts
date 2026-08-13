// @vitest-environment jsdom
//
// Motion card persistence. The card lives entirely on the device, so the
// contract that matters is: never throw, never lose the card, and always
// notify listening surfaces when it changes.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readPass, writePass, type MotionPass } from "./motion-pass";

const KEY = "aloya.motionpass.v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

function samplePass(overrides: Partial<MotionPass> = {}): MotionPass {
  return {
    number: "1234567890",
    holder: "A. Rider",
    balanceEur: 12.5,
    balanceUpdatedAt: 1_700_000_000_000,
    topups: [{ id: "t1", amountEur: 5, at: 1_700_000_000_000 }],
    transactions: [],
    lastSyncAt: 0,
    ...overrides,
  };
}

describe("readPass", () => {
  it("returns an empty card when nothing is stored", () => {
    const pass = readPass();
    expect(pass).toEqual({
      number: "",
      holder: "",
      balanceEur: 0,
      balanceUpdatedAt: 0,
      topups: [],
      transactions: [],
      lastSyncAt: 0,
    });
  });

  it("round-trips a written card", () => {
    const pass = samplePass();
    writePass(pass);
    expect(readPass()).toEqual(pass);
  });

  it("backfills fields missing from an older stored shape", () => {
    localStorage.setItem(KEY, JSON.stringify({ number: "999", balanceEur: 3 }));
    const pass = readPass();
    expect(pass.number).toBe("999");
    expect(pass.balanceEur).toBe(3);
    expect(pass.topups).toEqual([]);
    expect(pass.transactions).toEqual([]);
    expect(pass.lastSyncAt).toBe(0);
  });

  it("falls back to an empty card when the stored JSON is corrupt", () => {
    localStorage.setItem(KEY, "{not json");
    expect(readPass().number).toBe("");
  });

  it("preserves the linked-account block and pass catalogue", () => {
    const pass = samplePass({
      jcc: {
        email: "rider@example.com",
        displayName: "Rider",
        accessToken: "a",
        refreshToken: "r",
        expiresAt: 1_800_000_000_000,
        linkedAt: 1_700_000_000_000,
      },
      passes: [
        { code: "P1", name: "30-day", priceEur: 40, validityDays: 30, companyCode: "NPT" },
      ],
      passesUpdatedAt: 1_700_000_000_000,
    });
    writePass(pass);
    const back = readPass();
    expect(back.jcc?.email).toBe("rider@example.com");
    expect(back.passes?.[0].validityDays).toBe(30);
  });
});

describe("writePass", () => {
  it("notifies listening surfaces so every card view updates at once", () => {
    const seen = vi.fn();
    window.addEventListener("aloya:motionpass", seen);
    writePass(samplePass());
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener("aloya:motionpass", seen);
  });

  it("stores under the versioned key", () => {
    writePass(samplePass({ number: "5550001111" }));
    const raw = localStorage.getItem(KEY);
    expect(raw).toContain("5550001111");
  });
});
