import { describe, expect, it } from "vitest";

import { clearJccLink, formatCardNumber, maskedNumber, type MotionPass } from "./motion-pass";

function pass(overrides: Partial<MotionPass> = {}): MotionPass {
  return {
    number: "1234567890",
    balanceEur: 4.5,
    balanceUpdatedAt: 1,
    topups: [{ id: "t1", amountEur: 5, at: 1 }],
    transactions: [
      {
        id: "x1",
        at: "2026-01-01T00:00:00.000Z",
        type: "Topup",
        typeName: "Top up",
        priceEur: 5,
        balanceEur: 9.5,
        stopName: "Solomos",
        route: "150",
        passName: "18+ Standard",
      },
    ],
    lastSyncAt: 99,
    ...overrides,
  };
}

describe("formatCardNumber", () => {
  it("groups a 10-digit plastic card as 2+4+4", () => {
    expect(formatCardNumber("1234567890")).toBe("12 3456 7890");
  });

  it("groups partial input as the rider types", () => {
    expect(formatCardNumber("1")).toBe("1");
    expect(formatCardNumber("12")).toBe("12");
    expect(formatCardNumber("123")).toBe("12 3");
    expect(formatCardNumber("1234567")).toBe("12 3456 7");
  });

  it("groups a 16-digit chip serial in fours", () => {
    expect(formatCardNumber("1234567890123456")).toBe("1234 5678 9012 3456");
  });

  it("ignores separators the rider pastes in", () => {
    expect(formatCardNumber("12-3456 7890")).toBe("12 3456 7890");
  });

  it("returns an empty string for empty input", () => {
    expect(formatCardNumber("")).toBe("");
  });
});

describe("maskedNumber", () => {
  it("reveals only the last four digits", () => {
    expect(maskedNumber("1234567890")).toBe("•••• •••• 78 90");
  });

  it("reveals nothing for a too-short number", () => {
    expect(maskedNumber("12")).toBe("•••• •••• ••");
    expect(maskedNumber("")).toBe("•••• •••• ••");
  });

  it("never leaks a middle digit of a long serial", () => {
    const masked = maskedNumber("1234567890123456");
    expect(masked).not.toContain("1234");
    expect(masked.endsWith("34 56")).toBe(true);
  });
});

describe("clearJccLink", () => {
  it("drops the linked account and its synced transactions", () => {
    const linked = pass({
      jcc: {
        email: "rider@example.com",
        displayName: "Rider",
        accessToken: "a",
        refreshToken: "b",
        expiresAt: 1,
        linkedAt: 1,
      },
      passName: "18+ Standard",
    });
    const next = clearJccLink(linked);
    expect(next.jcc).toBeUndefined();
    expect(next.passName).toBeUndefined();
    expect(next.transactions).toEqual([]);
    expect(next.lastSyncAt).toBe(0);
  });

  it("keeps the card number, balance, and offline topups", () => {
    const next = clearJccLink(pass());
    expect(next.number).toBe("1234567890");
    expect(next.balanceEur).toBe(4.5);
    expect(next.topups).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const original = pass({
      jcc: {
        email: "rider@example.com",
        displayName: "Rider",
        accessToken: "a",
        refreshToken: "b",
        expiresAt: 1,
        linkedAt: 1,
      },
    });
    clearJccLink(original);
    expect(original.jcc).toBeDefined();
    expect(original.transactions).toHaveLength(1);
  });
});
