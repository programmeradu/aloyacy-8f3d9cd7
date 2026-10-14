// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MotionPass } from "../motion-pass";
import type { SavedPlace } from "../trip-store";

type Row = Record<string, unknown>;

const state = {
  motionRow: null as Row | null,
  motionSelectError: null as Error | null,
  motionUpsertError: null as { message: string } | null,
  placesRows: [] as Row[],
  placesSelectError: null as { message: string } | null,
  placesUpsertError: null as { message: string } | null,
};

const upsertMotionMock = vi.fn(async (_row: Row, _opts: unknown) => ({
  error: state.motionUpsertError,
}));
const upsertPlacesMock = vi.fn(async (_rows: Row[]) => ({ error: state.placesUpsertError }));

// Cloud reads/writes go through server functions (session-scoped). These
// stand-ins keep the old row/error state machine the cases below drive.
vi.mock("@/lib/user-data.functions", () => ({
  getMotionCard: async () => {
    if (state.motionSelectError) throw state.motionSelectError;
    return { row: state.motionRow };
  },
  saveMotionCard: async (args: { data: { row: Row } }) => {
    const { error } = await upsertMotionMock(args.data.row, { onConflict: "user_id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  listSavedPlacesCloud: async () => ({
    rows: state.placesSelectError ? null : state.placesRows,
  }),
  upsertSavedPlacesCloud: async (args: { data: { rows: Row[] } }) => {
    const { error } = await upsertPlacesMock(args.data.rows);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
}));

const readPassMock = vi.fn<() => MotionPass>();
const writePassMock = vi.fn<(p: MotionPass) => void>();
vi.mock("../motion-pass", () => ({
  readPass: () => readPassMock(),
  writePass: (p: MotionPass) => writePassMock(p),
}));

const listSavedPlacesMock = vi.fn<() => SavedPlace[]>();
vi.mock("../trip-store", () => ({
  listSavedPlaces: () => listSavedPlacesMock(),
}));

function emptyPass(overrides: Partial<MotionPass> = {}): MotionPass {
  return {
    number: "",
    holder: "",
    balanceEur: 0,
    balanceUpdatedAt: 0,
    topups: [],
    transactions: [],
    lastSyncAt: 0,
    ...overrides,
  };
}

describe("cloud-sync", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    state.motionRow = null;
    state.motionSelectError = null;
    state.motionUpsertError = null;
    state.placesRows = [];
    state.placesSelectError = null;
    state.placesUpsertError = null;
    upsertMotionMock.mockClear();
    upsertPlacesMock.mockClear();
    readPassMock.mockReset();
    writePassMock.mockReset();
    listSavedPlacesMock.mockReset();
    readPassMock.mockReturnValue(emptyPass());
    listSavedPlacesMock.mockReturnValue([]);
    window.localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("pullAll", () => {
    it("migrates a local motion card up when the cloud copy is empty", async () => {
      const { pullAll } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      await pullAll("user-1");
      expect(upsertMotionMock).toHaveBeenCalledTimes(1);
      const [row] = upsertMotionMock.mock.calls[0] as [Row, unknown];
      expect(row.user_id).toBe("user-1");
      expect(row.card_number).toBe("1234567890");
    });

    it("does not push when the local card number is too short", async () => {
      const { pullAll } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass({ number: "123" }));
      await pullAll("user-2");
      expect(upsertMotionMock).not.toHaveBeenCalled();
    });

    it("pulls the cloud motion card into local storage when cloud is fresher", async () => {
      const { pullAll } = await import("../cloud-sync");
      state.motionRow = {
        user_id: "user-3",
        card_number: "9999999999",
        holder: "Rider",
        tier: null,
        valid_until: null,
        card_type: null,
        balance_eur: 12.5,
        balance_updated_at: new Date(2000).toISOString(),
        jcc_email: null,
        jcc_display_name: null,
        jcc_tokens_encrypted: null,
        jcc_linked_at: null,
        last_sync_at: null,
        pass_name: null,
        updated_at: new Date(2000).toISOString(),
      };
      readPassMock.mockReturnValue(emptyPass());
      await pullAll("user-3");
      expect(writePassMock).toHaveBeenCalledTimes(1);
      const written = writePassMock.mock.calls[0][0];
      expect(written.number).toBe("9999999999");
      expect(written.balanceEur).toBe(12.5);
    });

    it("skips the pull when local balance is fresher than the cloud row", async () => {
      const { pullAll } = await import("../cloud-sync");
      state.motionRow = {
        user_id: "user-4",
        card_number: "8888888888",
        holder: null,
        tier: null,
        valid_until: null,
        card_type: null,
        balance_eur: 5,
        balance_updated_at: new Date(1000).toISOString(),
        jcc_email: null,
        jcc_display_name: null,
        jcc_tokens_encrypted: null,
        jcc_linked_at: null,
        last_sync_at: null,
        pass_name: null,
        updated_at: new Date(1000).toISOString(),
      };
      readPassMock.mockReturnValue(emptyPass({ number: "1111111111", balanceUpdatedAt: 5000 }));
      await pullAll("user-4");
      expect(writePassMock).not.toHaveBeenCalled();
    });

    it("is idempotent per user id — a second call for the same user is a no-op", async () => {
      const { pullAll } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      await pullAll("user-5");
      upsertMotionMock.mockClear();
      await pullAll("user-5");
      expect(upsertMotionMock).not.toHaveBeenCalled();
    });

    it("swallows a rejected motion pull and still resolves", async () => {
      const { pullAll } = await import("../cloud-sync");
      state.motionSelectError = new Error("network down");
      await expect(pullAll("user-6")).resolves.toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith("[cloud-sync] pull motion:", "network down");
    });

    it("migrates local saved places up when the cloud table is empty", async () => {
      const { pullAll } = await import("../cloud-sync");
      listSavedPlacesMock.mockReturnValue([
        {
          id: "not-a-uuid",
          label: "Home",
          name: "123 Main St",
          lat: 1,
          lng: 2,
          tone: "aegean",
          pinned: true,
          createdAt: 1,
        },
      ]);
      await pullAll("user-7");
      expect(upsertPlacesMock).toHaveBeenCalledTimes(1);
      const [rows] = upsertPlacesMock.mock.calls[0] as [Row[]];
      expect(rows[0].kind).toBe("home");
      expect(rows[0].id).toBeUndefined();
    });

    it("writes cloud saved places into localStorage and fires the store event", async () => {
      const { pullAll } = await import("../cloud-sync");
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");
      state.placesRows = [
        {
          id: "abc-123",
          label: "Work",
          address: "456 Office Rd",
          lat: 3,
          lng: 4,
          kind: "work",
          created_at: new Date(1000).toISOString(),
        },
      ];
      await pullAll("user-8");
      const stored = JSON.parse(window.localStorage.getItem("aloya:saved-places") || "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].tone).toBe("ochre");
      expect(stored[0].pinned).toBe(true);
      expect(dispatchSpy).toHaveBeenCalled();
    });

    it("silently skips a saved-places pull error", async () => {
      const { pullAll } = await import("../cloud-sync");
      state.placesSelectError = { message: "boom" };
      await expect(pullAll("user-9")).resolves.toBeUndefined();
      expect(window.localStorage.getItem("aloya:saved-places")).toBeNull();
    });
  });

  describe("schedulePush", () => {
    it("debounces rapid calls into a single push after 1500ms", async () => {
      const { schedulePush } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      schedulePush("user-10");
      vi.advanceTimersByTime(500);
      schedulePush("user-10");
      vi.advanceTimersByTime(500);
      schedulePush("user-10");
      expect(upsertMotionMock).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1500);
      await vi.waitFor(() => expect(upsertMotionMock).toHaveBeenCalledTimes(1));
    });

    it("logs a warning when the push upsert fails", async () => {
      const { schedulePush } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      state.motionUpsertError = { message: "conflict" };
      schedulePush("user-11");
      vi.advanceTimersByTime(1500);
      await vi.waitFor(() =>
        expect(console.warn).toHaveBeenCalledWith("[cloud-sync] motion push:", "conflict"),
      );
    });
  });

  describe("startCloudSync", () => {
    it("pulls immediately on start and wires listeners", async () => {
      const { startCloudSync } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      const cleanup = startCloudSync("user-12");
      await vi.waitFor(() => expect(upsertMotionMock).toHaveBeenCalledTimes(1));
      cleanup();
    });

    it("schedules a debounced push when a motionpass change event fires", async () => {
      const { startCloudSync } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass());
      const cleanup = startCloudSync("user-13");
      await vi.waitFor(() => expect(readPassMock).toHaveBeenCalled());
      upsertMotionMock.mockClear();
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      window.dispatchEvent(new Event("aloya:motionpass"));
      vi.advanceTimersByTime(1500);
      await vi.waitFor(() => expect(upsertMotionMock).toHaveBeenCalledTimes(1));
      cleanup();
    });

    it("schedules a debounced saved-places push on a matching store event", async () => {
      const { startCloudSync } = await import("../cloud-sync");
      const cleanup = startCloudSync("user-14");
      await vi.waitFor(() => expect(listSavedPlacesMock).toHaveBeenCalled());
      listSavedPlacesMock.mockReturnValue([
        {
          id: "id-1",
          label: "Home",
          name: "Somewhere",
          lat: 1,
          lng: 1,
          tone: "aegean",
          pinned: true,
          createdAt: 1,
        },
      ]);
      window.dispatchEvent(
        new CustomEvent("aloya:store", { detail: { key: "aloya:saved-places" } }),
      );
      vi.advanceTimersByTime(1500);
      await vi.waitFor(() => expect(upsertPlacesMock).toHaveBeenCalledTimes(1));
      cleanup();
    });

    it("ignores store events for unrelated keys", async () => {
      const { startCloudSync } = await import("../cloud-sync");
      const cleanup = startCloudSync("user-15");
      await vi.waitFor(() => expect(listSavedPlacesMock).toHaveBeenCalled());
      upsertPlacesMock.mockClear();
      window.dispatchEvent(
        new CustomEvent("aloya:store", { detail: { key: "aloya:some-other-key" } }),
      );
      vi.advanceTimersByTime(1500);
      expect(upsertPlacesMock).not.toHaveBeenCalled();
      cleanup();
    });

    it("re-pulls on window focus", async () => {
      const { startCloudSync } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass());
      const cleanup = startCloudSync("user-16");
      await vi.waitFor(() => expect(readPassMock).toHaveBeenCalled());
      const callsBefore = readPassMock.mock.calls.length;
      window.dispatchEvent(new Event("focus"));
      await vi.waitFor(() => expect(readPassMock.mock.calls.length).toBeGreaterThan(callsBefore));
      cleanup();
    });

    it("cleans up listeners and pending timers on unmount", async () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const { startCloudSync } = await import("../cloud-sync");
      readPassMock.mockReturnValue(emptyPass());
      const cleanup = startCloudSync("user-17");
      await vi.waitFor(() => expect(readPassMock).toHaveBeenCalled());
      cleanup();
      expect(removeSpy).toHaveBeenCalledWith("aloya:motionpass", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("aloya:store", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("focus", expect.any(Function));

      // After cleanup, firing the events should not trigger any further push.
      upsertMotionMock.mockClear();
      readPassMock.mockReturnValue(emptyPass({ number: "1234567890" }));
      window.dispatchEvent(new Event("aloya:motionpass"));
      vi.advanceTimersByTime(2000);
      expect(upsertMotionMock).not.toHaveBeenCalled();
    });
  });
});
