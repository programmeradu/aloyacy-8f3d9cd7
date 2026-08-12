import { describe, it, expect, beforeEach, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  readPass,
  readPassSync,
  writePass,
  mergePass,
  subscribePass,
  clearJccLink,
  formatCardNumber,
  maskedNumber,
  type MotionPass,
} from "../motionPass";

const KEY = "aloya.motionpass.v1";

// The module memoises the card in a module-level cache, so every test starts
// from a fresh module registry as well as fresh storage.
beforeEach(async () => {
  await AsyncStorage.clear();
  vi.resetModules();
});

async function fresh() {
  vi.resetModules();
  return (await import("../motionPass")) as typeof import("../motionPass");
}

describe("motionPass storage", () => {
  it("returns an empty card when nothing is stored", async () => {
    const mod = await fresh();
    const pass = await mod.readPass();
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

  it("hydrates a stored card and backfills missing collections", async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ number: "12345678", balanceEur: 4.5 }));
    const mod = await fresh();
    const pass = await mod.readPass();
    expect(pass.number).toBe("12345678");
    expect(pass.balanceEur).toBe(4.5);
    expect(pass.topups).toEqual([]);
    expect(pass.transactions).toEqual([]);
  });

  it("degrades to an empty card when the stored payload is corrupt", async () => {
    await AsyncStorage.setItem(KEY, "{not json");
    const mod = await fresh();
    await expect(mod.readPass()).resolves.toMatchObject({ number: "", balanceEur: 0 });
  });

  it("serves the cached card on subsequent reads without touching storage", async () => {
    const mod = await fresh();
    await mod.readPass();
    await AsyncStorage.setItem(KEY, JSON.stringify({ number: "99999999" }));
    // Cache wins: the second read must not observe the out-of-band write.
    expect((await mod.readPass()).number).toBe("");
  });

  it("readPassSync returns an empty card before hydration and the cache after", async () => {
    const mod = await fresh();
    expect(mod.readPassSync().number).toBe("");
    await mod.writePass({ ...(await mod.readPass()), number: "11112222" });
    expect(mod.readPassSync().number).toBe("11112222");
  });

  it("persists writes and notifies subscribers", async () => {
    const seen: MotionPass[] = [];
    const unsubscribe = subscribePass((p) => seen.push(p));
    const base = await readPass();
    await writePass({ ...base, number: "12341234", balanceEur: 9 });
    expect(seen).toHaveLength(1);
    expect(seen[0].balanceEur).toBe(9);
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!).number).toBe("12341234");

    unsubscribe();
    await writePass({ ...base, number: "5555" });
    expect(seen).toHaveLength(1);
  });

  it("merges patches over the current card", async () => {
    const mod = await fresh();
    await mod.writePass({ ...(await mod.readPass()), number: "12345678", balanceEur: 2 });
    const merged = await mod.mergePass({ balanceEur: 7, holder: "Rider" });
    expect(merged).toMatchObject({ number: "12345678", balanceEur: 7, holder: "Rider" });
    expect(mod.readPassSync().balanceEur).toBe(7);
  });

  it("mergePass on a cold cache keeps the empty defaults", async () => {
    const mod = await fresh();
    const merged = await mod.mergePass({ balanceEur: 3 });
    expect(merged.topups).toEqual([]);
    expect(merged.balanceEur).toBe(3);
  });
});

describe("clearJccLink", () => {
  it("drops the link, its transactions and the pass name", () => {
    const linked: MotionPass = {
      number: "12345678",
      balanceEur: 5,
      balanceUpdatedAt: 1,
      topups: [{ id: "t1", amountEur: 5, at: 1 }],
      transactions: [
        {
          id: "x",
          at: "2026-01-01",
          type: "ride",
          typeName: "Ride",
          priceEur: 1.5,
          balanceEur: 3.5,
          stopName: "Solomou",
          route: "30",
          passName: "Adult",
        },
      ],
      lastSyncAt: 99,
      passName: "Adult",
      jcc: {
        email: "rider@example.com",
        displayName: "Rider",
        accessToken: "a",
        refreshToken: "r",
        expiresAt: 10,
        linkedAt: 1,
      },
    };
    const cleared = clearJccLink(linked);
    expect(cleared.jcc).toBeUndefined();
    expect(cleared.passName).toBeUndefined();
    expect(cleared.transactions).toEqual([]);
    expect(cleared.lastSyncAt).toBe(0);
    // Non-JCC state survives, and the input is not mutated.
    expect(cleared.topups).toHaveLength(1);
    expect(linked.jcc).toBeDefined();
  });
});

describe("card number formatting", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["12", "12"],
    ["1234", "12 34"],
    ["123456", "12 3456"],
    ["1234567890", "12 3456 7890"],
  ])("groups short numbers: %s", (input, expected) => {
    expect(formatCardNumber(input)).toBe(expected);
  });

  it("groups long numbers in fours and ignores separators already typed", () => {
    expect(formatCardNumber("1234-5678 9012")).toBe("1234 5678 9012");
  });

  it("masks all but the last four digits", () => {
    expect(maskedNumber("1234567890")).toBe("•••• •••• 78 90");
  });

  it("masks fully when there are fewer than four digits", () => {
    expect(maskedNumber("12")).toBe("•••• •••• ••");
    expect(maskedNumber("abc")).toBe("•••• •••• ••");
  });
});
