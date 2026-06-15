import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

/**
 * High-performance SQLite backing for the Aloya mobile schedule.
 *
 * Replaces the JSON sharding strategy with a single, pre-indexed
 * .sqlite file. This allows for complex spatial and time-based
 * queries without loading megabytes of JSON into memory.
 */

const DB_NAME = "schedule_v1.db";
const DB_DIR = `${FileSystem.documentDirectory ?? ""}SQLite/`;
const REMOTE_DB_URL = "https://app.aloya.cy/data/schedule/schedule.db.gz";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  if (Platform.OS === "web") {
    throw new Error("SQLite is not supported on web");
  }

  // Ensure the SQLite directory exists for manual file placement
  const dirInfo = await FileSystem.getInfoAsync(DB_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DB_DIR, { intermediates: true });
  }

  _db = await SQLite.openDatabaseAsync(DB_NAME);
  return _db;
}

/**
 * Check if the schedule database is present and initialized.
 */
export async function isDbReady(): Promise<boolean> {
  try {
    const db = await getDb();
    // Quick probe to see if our tables exist
    const result = await db.getFirstAsync<{ count: number }>(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='stops'"
    );
    return (result?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Find the nearest stops using SQL spatial logic (bounding box).
 */
export async function findNearbyStops(lat: number, lng: number, radiusKm: number = 0.5) {
  const db = await getDb();
  const degPerKm = 1 / 111; // Rough approximation
  const delta = radiusKm * degPerKm;

  return await db.getAllAsync<{ id: string; name: string; lat: number; lng: number; code: string }>(
    `SELECT * FROM stops
     WHERE lat BETWEEN ? AND ?
     AND lng BETWEEN ? AND ?
     LIMIT 50`,
    [lat - delta, lat + delta, lng - delta, lng + delta]
  );
}

/**
 * Get full arrivals for a stop from the local DB.
 */
export async function getOfflineArrivals(stopId: string, limit: number = 20) {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  return await db.getAllAsync(
    `SELECT st.*, r.short_name, r.color, t.headsign
     FROM stop_times st
     JOIN trips t ON st.trip_id = t.id
     JOIN routes r ON t.route_id = r.id
     WHERE st.stop_id = ? AND st.arrival_unix >= ?
     ORDER BY st.arrival_unix ASC
     LIMIT ?`,
    [stopId, now, limit]
  );
}
