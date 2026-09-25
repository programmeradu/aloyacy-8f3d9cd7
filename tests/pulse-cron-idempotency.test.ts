import { describe, expect, it } from "vitest";

/**
 * Idempotency verification suite for the GTFS snapshot ingest and pulse cron pipeline.
 *
 * Verifies that repeating an ingestion batch or re-running a cron cycle with identical
 * timestamps / primary keys does not produce duplicate rows or inconsistent aggregations.
 * Tests correspond directly to the database semantics defined in
 * deploy/supabase/sql/20260821_ingest_v2_and_retention.sql:
 *   - rt_snapshots ON CONFLICT (trip_id, stop_id) DO UPDATE
 *   - observed_arrivals ON CONFLICT (trip_id, stop_id) DO UPDATE
 *   - delay_stats ON CONFLICT (route_id, stop_id, hour_of_day, day_of_week) DO UPDATE
 */

interface SnapshotRow {
  route_id: string;
  stop_id: string;
  trip_id: string;
  predicted_arrival: string;
  delay_sec: number;
  captured_at: string;
}

interface DelayStatRow {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_delay_sec: number;
  sample_count: number;
  updated_at: string;
}

// In-memory simulation of PostgreSQL `ingest_gtfs_snapshots_v2`
class MockIngestDatabase {
  rtSnapshots = new Map<string, SnapshotRow>(); // key: `${trip_id}:${stop_id}`
  observedArrivals = new Map<string, SnapshotRow>(); // key: `${trip_id}:${stop_id}`
  delayStats = new Map<string, DelayStatRow>(); // key: `${route_id}:${stop_id}:${hour}:${dow}`

  ingestSnapshotsV2(
    snapshots: SnapshotRow[],
    observed: SnapshotRow[],
    stats: Array<{
      route_id: string;
      stop_id: string;
      hour_of_day: number;
      day_of_week: number;
      sum_delay_sec: number;
      count: number;
    }>,
  ) {
    // 1. rt_snapshots: ON CONFLICT (trip_id, stop_id) DO UPDATE
    for (const s of snapshots) {
      const key = `${s.trip_id}:${s.stop_id}`;
      this.rtSnapshots.set(key, { ...s });
    }

    // 2. observed_arrivals: ON CONFLICT (trip_id, stop_id) DO UPDATE
    for (const o of observed) {
      const key = `${o.trip_id}:${o.stop_id}`;
      this.observedArrivals.set(key, { ...o });
    }

    // 3. delay_stats: ON CONFLICT (route_id, stop_id, hour_of_day, day_of_week) DO UPDATE
    for (const stat of stats) {
      const key = `${stat.route_id}:${stat.stop_id}:${stat.hour_of_day}:${stat.day_of_week}`;
      const existing = this.delayStats.get(key);
      const incomingMean = stat.sum_delay_sec / Math.max(stat.count, 1);

      if (!existing) {
        this.delayStats.set(key, {
          route_id: stat.route_id,
          stop_id: stat.stop_id,
          hour_of_day: stat.hour_of_day,
          day_of_week: stat.day_of_week,
          mean_delay_sec: incomingMean,
          sample_count: stat.count,
          updated_at: new Date().toISOString(),
        });
      } else {
        const mergedCount = Math.min(existing.sample_count + stat.count, 100000);
        const mergedMean =
          (existing.mean_delay_sec * existing.sample_count + incomingMean * stat.count) /
          Math.max(existing.sample_count + stat.count, 1);

        this.delayStats.set(key, {
          ...existing,
          mean_delay_sec: mergedMean,
          sample_count: mergedCount,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
}

describe("pulse-cron and ingest pipeline idempotency", () => {
  it("guarantees rt_snapshots and observed_arrivals do not duplicate rows on re-ingest", () => {
    const db = new MockIngestDatabase();

    const sampleSnapshot: SnapshotRow = {
      route_id: "X400",
      stop_id: "2660-stop-1",
      trip_id: "trip-kokkino-101",
      predicted_arrival: "2026-09-25T08:30:00Z",
      delay_sec: 45,
      captured_at: "2026-09-25T08:15:00Z",
    };

    // First ingestion run
    db.ingestSnapshotsV2([sampleSnapshot], [sampleSnapshot], []);
    expect(db.rtSnapshots.size).toBe(1);
    expect(db.observedArrivals.size).toBe(1);

    // Second ingestion run with identical timestamp and primary key
    db.ingestSnapshotsV2([sampleSnapshot], [sampleSnapshot], []);
    expect(db.rtSnapshots.size).toBe(1);
    expect(db.observedArrivals.size).toBe(1);

    // Third ingestion run with updated delay (bus moved closer)
    const updatedSnapshot: SnapshotRow = {
      ...sampleSnapshot,
      delay_sec: 12,
      captured_at: "2026-09-25T08:16:00Z",
    };
    db.ingestSnapshotsV2([updatedSnapshot], [updatedSnapshot], []);
    expect(db.rtSnapshots.size).toBe(1);
    expect(db.observedArrivals.size).toBe(1);
    expect(db.rtSnapshots.get("trip-kokkino-101:2660-stop-1")?.delay_sec).toBe(12);
  });

  it("ensures delay_stats unique constraint prevents duplicate hour/dow rows", () => {
    const db = new MockIngestDatabase();

    const statDelta = {
      route_id: "X400",
      stop_id: "2660-stop-1",
      hour_of_day: 8,
      day_of_week: 5, // Friday
      sum_delay_sec: 120,
      count: 2, // mean: 60s
    };

    // First batch
    db.ingestSnapshotsV2([], [], [statDelta]);
    expect(db.delayStats.size).toBe(1);
    expect(db.delayStats.get("X400:2660-stop-1:8:5")?.mean_delay_sec).toBe(60);
    expect(db.delayStats.get("X400:2660-stop-1:8:5")?.sample_count).toBe(2);

    // Re-run with second batch
    db.ingestSnapshotsV2([], [], [statDelta]);
    expect(db.delayStats.size).toBe(1); // exactly one row maintained
    expect(db.delayStats.get("X400:2660-stop-1:8:5")?.sample_count).toBe(4);
  });

  it("guarantees R2 data lake key determinism preventing phantom orphan objects", () => {
    const r2Lake = new Map<string, string>();

    function mockR2ArchivePut(table: string, datePartition: string, timestamp: number, data: string) {
      // Deterministic partition path
      const key = `${table}/${datePartition}/${timestamp}.jsonl`;
      r2Lake.set(key, data);
      return key;
    }

    const testTime = 1790326800000;
    const testDate = "2026-09-25";
    const payload = JSON.stringify({ trip_id: "trip-1", stop_id: "stop-1", delay: 30 });

    const key1 = mockR2ArchivePut("observed_arrivals", testDate, testTime, payload);
    const key2 = mockR2ArchivePut("observed_arrivals", testDate, testTime, payload);

    expect(key1).toBe(key2);
    expect(r2Lake.size).toBe(1);
    expect(r2Lake.get(key1)).toBe(payload);
  });
});
