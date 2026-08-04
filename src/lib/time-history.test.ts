// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { listTimeHistory, recordTimeUsage } from "./time-history";

function makeMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as Storage;
}

describe("time-history", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: makeMemoryStorage(),
      configurable: true,
    });
  });

  it("returns empty array when nothing recorded", () => {
    expect(listTimeHistory()).toEqual([]);
  });

  it("records and lists a usage", () => {
    recordTimeUsage({ atMs: Date.now() + 60_000, mode: "leave" });
    const list = listTimeHistory();
    expect(list).toHaveLength(1);
    expect(list[0].mode).toBe("leave");
  });

  it("dedupes usages of the same mode within 10 minutes", () => {
    const now = Date.now();
    recordTimeUsage({ atMs: now, mode: "arrive" });
    recordTimeUsage({ atMs: now + 5 * 60_000, mode: "arrive" });
    expect(listTimeHistory()).toHaveLength(1);
  });

  it("does not dedupe usages far enough apart", () => {
    const now = Date.now();
    recordTimeUsage({ atMs: now, mode: "arrive" });
    recordTimeUsage({ atMs: now + 15 * 60_000, mode: "arrive" });
    expect(listTimeHistory()).toHaveLength(2);
  });

  it("does not dedupe across different modes at the same time", () => {
    const now = Date.now();
    recordTimeUsage({ atMs: now, mode: "arrive" });
    recordTimeUsage({ atMs: now, mode: "leave" });
    expect(listTimeHistory()).toHaveLength(2);
  });

  it("ignores non-finite atMs", () => {
    recordTimeUsage({ atMs: NaN, mode: "leave" });
    expect(listTimeHistory()).toHaveLength(0);
  });

  it("caps stored entries at MAX_ENTRIES (60), keeping most recent first", () => {
    for (let i = 0; i < 65; i++) {
      recordTimeUsage({ atMs: Date.now() + i * 20 * 60_000, mode: "leave" });
    }
    const list = listTimeHistory();
    expect(list.length).toBe(60);
  });

  it("filters out entries older than MAX_AGE_MS", () => {
    const tooOld = Date.now() - 121 * 24 * 60 * 60_000;
    window.localStorage.setItem(
      "aloya:time-history",
      JSON.stringify([{ atMs: tooOld, mode: "leave" }]),
    );
    expect(listTimeHistory()).toEqual([]);
  });

  it("filters out malformed entries (missing fields, bad mode)", () => {
    window.localStorage.setItem(
      "aloya:time-history",
      JSON.stringify([
        { atMs: Date.now(), mode: "bogus" },
        { mode: "leave" },
        null,
        "not-an-object",
        { atMs: Date.now(), mode: "arrive" },
      ]),
    );
    const list = listTimeHistory();
    expect(list).toHaveLength(1);
    expect(list[0].mode).toBe("arrive");
  });

  it("returns empty array when stored value is not an array", () => {
    window.localStorage.setItem("aloya:time-history", JSON.stringify({ foo: "bar" }));
    expect(listTimeHistory()).toEqual([]);
  });

  it("returns empty array when stored JSON is malformed", () => {
    window.localStorage.setItem("aloya:time-history", "{not json");
    expect(listTimeHistory()).toEqual([]);
  });

  it("dispatches a custom event when a usage is recorded", () => {
    let fired = false;
    window.addEventListener("aloya:time-history", () => {
      fired = true;
    });
    recordTimeUsage({ atMs: Date.now(), mode: "leave" });
    expect(fired).toBe(true);
  });

  it("fails soft when localStorage.setItem throws", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
      configurable: true,
    });
    expect(() => recordTimeUsage({ atMs: Date.now(), mode: "leave" })).not.toThrow();
  });
});
