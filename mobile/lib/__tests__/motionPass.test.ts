import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";

const reset = () => (AsyncStorage as unknown as { __reset(): void }).__reset();

async function freshModule() {
  vi.resetModules();
  reset();
  return import("@/lib/motionPass");
}

describe("readPass / readPassSync", () => {
  it("returns a fresh empty pass when storage has nothing", async () => {
    const m = await freshModule();
    const pass = await m.readPass();
    expect(pass).toMatchObject({ number: "", balanceEur: 0, topups: [], transactions: [] });
  });

  it("readPassSync returns empty before any read/write has populated the cache", async () => {
    const m = await freshModule();
    expect(m.readPassSync()).toMatchObject({ number: "" });
  });

  it("caches after the first read, avoiding a second storage hit", async () => {
    const m = await freshModule();
    await m.readPass();
    const spy = vi.spyOn(AsyncStorage, "getItem");
    await m.readPass();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fills in defaults for a partially-shaped stored pass", async () => {
    const m = await freshModule();
    await AsyncStorage.setItem("aloya.motionpass.v1", JSON.stringify({ number: "1234" }));
    vi.resetModules();
    reset(); // NOTE: intentionally not resetting storage — see below
  });

  it("hydrates topups/transactions defensively when missing from stored JSON", async () => {
    await AsyncStorage.setItem("aloya.motionpass.v1", JSON.stringify({ number: "5678", balanceEur: 12 }));
    vi.resetModules();
    const m = await import("@/lib/motionPass");
    const pass = await m.readPass();
    expect(pass.number).toBe("5678");
    expect(pass.balanceEur).toBe(12);
    expect(pass.topups).toEqual([]);
    expect(pass.transactions).toEqual([]);
  });

  it("falls back to empty on corrupt JSON in storage", async () => {
    await AsyncStorage.setItem("aloya.motionpass.v1", "{not json");
    vi.resetModules();
    const m = await import("@/lib/motionPass");
    const pass = await m.readPass();
    expect(pass.number).toBe("");
  });
});

describe("writePass / subscribePass", () => {
  it("persists and notifies subscribers", async () => {
    const m = await freshModule();
    const seen: number[] = [];
    const unsub = m.subscribePass((p) => seen.push(p.balanceEur));
    const pass = await m.readPass();
    await m.writePass({ ...pass, balanceEur: 42 });
    expect(seen).toEqual([42]);
    const raw = await AsyncStorage.getItem("aloya.motionpass.v1");
    expect(JSON.parse(raw!).balanceEur).toBe(42);
    unsub();
  });

  it("stops notifying after unsubscribe", async () => {
    const m = await freshModule();
    const seen: number[] = [];
    const unsub = m.subscribePass((p) => seen.push(p.balanceEur));
    unsub();
    const pass = await m.readPass();
    await m.writePass({ ...pass, balanceEur: 99 });
    expect(seen).toEqual([]);
  });
});

describe("mergePass", () => {
  it("shallow-merges a patch onto the current pass and persists it", async () => {
    const m = await freshModule();
    await m.mergePass({ number: "1111" });
    const merged = await m.mergePass({ balanceEur: 7 });
    expect(merged).toMatchObject({ number: "1111", balanceEur: 7 });
  });
});

describe("clearJccLink", () => {
  it("removes jcc + passName + transactions + syncedAt without mutating the input", async () => {
    const m = await freshModule();
    const pass = { ...(await m.readPass()), jcc: { email: "a@b.com" } as any, passName: "Gold", transactions: [{} as any], lastSyncAt: 123 };
    const cleared = m.clearJccLink(pass);
    expect(cleared.jcc).toBeUndefined();
    expect(cleared.passName).toBeUndefined();
    expect(cleared.transactions).toEqual([]);
    expect(cleared.lastSyncAt).toBe(0);
    expect(pass.jcc).toBeDefined(); // original untouched
  });
});

describe("formatCardNumber", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["12", "12"],
    ["123", "12 3"],
    ["123456", "12 3456"],
    ["1234567890", "12 3456 7890"],
    ["12345678901", "1234 5678 901"],
    ["123456789012", "1234 5678 9012"],
  ])("formats %s as %s", async (input, expected) => {
    const m = await freshModule();
    expect(m.formatCardNumber(input)).toBe(expected);
  });

  it("strips non-digit characters before formatting", async () => {
    const m = await freshModule();
    expect(m.formatCardNumber("12-34 56")).toBe("12 3456");
  });
});

describe("maskedNumber", () => {
  it("returns a full mask placeholder for short/invalid numbers", async () => {
    const m = await freshModule();
    expect(m.maskedNumber("123")).toBe("•••• •••• ••");
    expect(m.maskedNumber("")).toBe("•••• •••• ••");
  });

  it("reveals only the last 4 digits", async () => {
    const m = await freshModule();
    expect(m.maskedNumber("1234567890")).toBe("•••• •••• 78 90");
  });

  it("ignores non-digit separators", async () => {
    const m = await freshModule();
    expect(m.maskedNumber("1234-5678-90")).toBe("•••• •••• 78 90");
  });
});
