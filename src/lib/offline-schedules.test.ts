import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOfflineSchedules,
  downloadOfflineSchedules,
  formatBytes,
  getOfflineStatus,
  isOfflineCacheSupported,
  type DownloadProgress,
} from "./offline-schedules";

function makeResponse(opts: { ok: boolean; json?: unknown; bytes?: number }): Response {
  const body = opts.bytes != null ? new Uint8Array(opts.bytes) : new Uint8Array(0);
  const res = {
    ok: opts.ok,
    json: vi.fn(async (): Promise<unknown> => opts.json),
    clone: vi.fn((): Response => res),
    arrayBuffer: vi.fn(async (): Promise<ArrayBuffer> => body.buffer),
  } as unknown as Response;
  return res;
}

describe("offline-schedules", () => {
  let store: Record<string, string>;
  let cachePut: ReturnType<typeof vi.fn>;
  let cachesOpen: ReturnType<typeof vi.fn>;
  let cachesDelete: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((k: string): string | null => store[k] ?? null),
      setItem: vi.fn((k: string, v: string): void => {
        store[k] = v;
      }),
      removeItem: vi.fn((k: string): void => {
        delete store[k];
      }),
    });
    cachePut = vi.fn(async (): Promise<void> => {});
    cachesOpen = vi.fn(async (): Promise<Cache> => ({ put: cachePut }) as unknown as Cache);
    cachesDelete = vi.fn(async (): Promise<boolean> => true);
    vi.stubGlobal("caches", { open: cachesOpen, delete: cachesDelete });
    (window as unknown as { caches: unknown }).caches = { open: cachesOpen, delete: cachesDelete };
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports unsupported when caches is absent from window", () => {
    vi.stubGlobal("caches", undefined);
    delete (window as { caches?: unknown }).caches;
    expect(isOfflineCacheSupported()).toBe(false);
  });

  it("reports supported when caches exists on window", () => {
    expect(isOfflineCacheSupported()).toBe(true);
  });

  it("throws when downloading in an unsupported browser", async () => {
    vi.stubGlobal("caches", undefined);
    delete (window as { caches?: unknown }).caches;
    await expect(downloadOfflineSchedules({})).rejects.toThrow(
      "Offline cache is not supported in this browser.",
    );
  });

  it("clamps daysAhead below 1 up to 1 requested day", async () => {
    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) return Promise.resolve(makeResponse({ ok: false }));
      return Promise.resolve(makeResponse({ ok: true, bytes: 10 }));
    });
    const status = await downloadOfflineSchedules({ daysAhead: 0 });
    // No by-date index available -> falls back to requested (1 day) -> 2 date urls + 5 base
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    const dateUrlCount = urls.filter((u) => /by-date\/\d{8}\//.test(u)).length;
    expect(dateUrlCount).toBe(2);
    expect(status.dates.length).toBe(1);
  });

  it("clamps daysAhead above 14 down to 14 requested days", async () => {
    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) return Promise.resolve(makeResponse({ ok: false }));
      return Promise.resolve(makeResponse({ ok: true, bytes: 5 }));
    });
    await downloadOfflineSchedules({ daysAhead: 999 });
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    const dateUrlCount = urls.filter((u) => /by-date\/\d{8}\//.test(u)).length;
    expect(dateUrlCount).toBe(28); // 14 days * 2 files
  });

  it("intersects requested dates with the by-date index and avoids 404s for unlisted dates", async () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayYmd = `${y}${m}${d}`;

    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) {
        return Promise.resolve(makeResponse({ ok: true, json: { [todayYmd]: true } }));
      }
      return Promise.resolve(makeResponse({ ok: true, bytes: 1 }));
    });

    const status = await downloadOfflineSchedules({ daysAhead: 5 });
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    const dateUrls = urls.filter((u) => /by-date\/\d{8}\//.test(u));
    // Only today's two files should be requested, none of the other 4 requested days
    expect(dateUrls).toHaveLength(2);
    expect(dateUrls.every((u) => u.includes(todayYmd))).toBe(true);
    expect(status.dates).toEqual([todayYmd]);
  });

  it("does not fetch by-date files for dates absent from the index", async () => {
    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) {
        return Promise.resolve(makeResponse({ ok: true, json: {} }));
      }
      return Promise.resolve(makeResponse({ ok: true, bytes: 1 }));
    });
    const status = await downloadOfflineSchedules({ daysAhead: 3 });
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.filter((u) => /by-date\/\d{8}\//.test(u))).toHaveLength(0);
    expect(status.dates).toEqual([]);
  });

  it("calls onProgress once per file in order plus a final Done event", async () => {
    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) return Promise.resolve(makeResponse({ ok: false }));
      return Promise.resolve(makeResponse({ ok: true, bytes: 1 }));
    });
    const progress: DownloadProgress[] = [];
    await downloadOfflineSchedules({
      daysAhead: 1,
      onProgress: (p: DownloadProgress): void => {
        progress.push(p);
      },
    });
    // 5 base files + 2 date files = 7, plus a final "Done" call = 8 total
    expect(progress).toHaveLength(8);
    expect(progress[0]).toEqual({ total: 7, done: 0, currentLabel: "feeds.json" });
    for (let i = 1; i < 7; i++) {
      expect(progress[i].done).toBe(i);
    }
    const last = progress[progress.length - 1];
    expect(last).toEqual({ total: 7, done: 7, currentLabel: "Done" });
  });

  it("accumulates bytes only from successfully cached files and persists status", async () => {
    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) return Promise.resolve(makeResponse({ ok: false }));
      if (url.includes("stops.json")) return Promise.resolve(makeResponse({ ok: false }));
      return Promise.resolve(makeResponse({ ok: true, bytes: 100 }));
    });
    const status = await downloadOfflineSchedules({ daysAhead: 1 });
    // 6 of 7 files succeed with 100 bytes each (stops.json fails and contributes 0)
    expect(status.bytes).toBe(600);
    expect(cachePut).toHaveBeenCalledTimes(6);
    const saved = getOfflineStatus();
    expect(saved).toEqual(status);
  });

  it("skips caching a failed fetch response but continues processing", async () => {
    fetchMock.mockImplementation((url: string): Promise<Response> => {
      if (url.includes("index.json")) return Promise.resolve(makeResponse({ ok: false }));
      if (url.includes("routes.json")) return Promise.reject(new Error("network down"));
      return Promise.resolve(makeResponse({ ok: true, bytes: 10 }));
    });
    const status = await downloadOfflineSchedules({ daysAhead: 1 });
    expect(status.bytes).toBe(60); // 6 successful of 7 files
  });

  it("clearOfflineSchedules deletes the cache bucket and clears saved status", async () => {
    store["aloya.offline.status.v1"] = JSON.stringify({ dates: [], lastUpdatedAt: 1, bytes: 1 });
    await clearOfflineSchedules();
    expect(cachesDelete).toHaveBeenCalledWith("aloya-schedule-v1");
    expect(getOfflineStatus()).toBeNull();
  });

  it("clearOfflineSchedules is a no-op when unsupported", async () => {
    vi.stubGlobal("caches", undefined);
    delete (window as { caches?: unknown }).caches;
    await clearOfflineSchedules();
    expect(cachesDelete).not.toHaveBeenCalled();
  });
});

describe("formatBytes", () => {
  it("formats sub-kilobyte sizes as whole bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats sizes at or above 1024 bytes as rounded kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
  });

  it("formats sizes at or above 1MB as megabytes with one decimal place", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});
