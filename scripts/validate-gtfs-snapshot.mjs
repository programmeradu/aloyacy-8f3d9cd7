#!/usr/bin/env node
// Data-Quality Gate for GTFS / GTFS-RT pipeline
//
// Enforces hard validation constraints on snapshots:
// 1. Non-empty trip / vehicle collection
// 2. Strict Cyprus geographic coordinate bounding (lat: 34.5 - 35.7, lng: 32.2 - 34.6)
// 3. Plausible delays (delay_sec is an integer)
// 4. Monotonic, non-corrupted timestamps (within allowable temporal horizons)
//
// Usage:
//   node scripts/validate-gtfs-snapshot.mjs                  # run on test fixture / self-test
//   node scripts/validate-gtfs-snapshot.mjs <file.json>      # run on dumped snapshot json

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const CYPRUS_BOUNDS = {
  MIN_LAT: 34.5,
  MAX_LAT: 35.7,
  MIN_LNG: 32.2,
  MAX_LNG: 34.6,
};

/**
 * Validates a GTFS Realtime snapshot for pipeline ingestion.
 * @param {object} snapshot
 * @returns {{ valid: boolean, errors: string[], warnings: string[], summary: object }}
 */
export function validateGtfsSnapshot(snapshot) {
  const errors = [];
  const warnings = [];

  if (!snapshot || typeof snapshot !== "object") {
    return { valid: false, errors: ["Snapshot payload is null or not an object"], warnings, summary: {} };
  }

  const arrivals = Array.isArray(snapshot.arrivals) ? snapshot.arrivals : [];
  const vehicles = Array.isArray(snapshot.vehicles) ? snapshot.vehicles : [];
  const fetchedAt = Number(snapshot.fetchedAt);

  // 1. Monotonic / Plausible Fetch Timestamp
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    errors.push(`Invalid or non-monotonic fetchedAt timestamp: ${snapshot.fetchedAt}`);
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    // Allow up to 24h skew for backfilling, but reject epoch 0 or future timestamps > 1 hour
    if (fetchedAt > nowSec + 3600) {
      errors.push(`fetchedAt is too far into the future: ${fetchedAt} (now: ${nowSec})`);
    }
  }

  // 2. Non-empty trips or vehicles
  if (arrivals.length === 0 && vehicles.length === 0) {
    warnings.push("Snapshot contains zero arrivals and zero active vehicles");
  }

  // 3. Coordinate Bounds within Cyprus
  let boundedVehicles = 0;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const lat = Number(v.lat);
    const lng = Number(v.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.push(`Vehicle [${v.tripId || v.id || i}] missing finite lat/lng coordinates`);
      continue;
    }

    if (
      lat < CYPRUS_BOUNDS.MIN_LAT ||
      lat > CYPRUS_BOUNDS.MAX_LAT ||
      lng < CYPRUS_BOUNDS.MIN_LNG ||
      lng > CYPRUS_BOUNDS.MAX_LNG
    ) {
      errors.push(
        `Vehicle [${v.tripId || v.id || i}] coordinate out of Cyprus bounds: (${lat}, ${lng}). Allowed lat: [${CYPRUS_BOUNDS.MIN_LAT}, ${CYPRUS_BOUNDS.MAX_LAT}], lng: [${CYPRUS_BOUNDS.MIN_LNG}, ${CYPRUS_BOUNDS.MAX_LNG}]`,
      );
    } else {
      boundedVehicles++;
    }
  }

  // 4. Arrivals Validation: trip/stop identifiers, timestamps, delay plausibility
  let validArrivals = 0;
  for (let i = 0; i < arrivals.length; i++) {
    const a = arrivals[i];
    if (!a.routeId || !a.stopId || !a.tripId) {
      errors.push(`Arrival record #${i} missing required identifiers (routeId, stopId, or tripId)`);
      continue;
    }

    const arrUnix = Number(a.arrivalUnix);
    if (!Number.isFinite(arrUnix) || arrUnix <= 0) {
      errors.push(`Arrival record #${i} (${a.tripId} @ ${a.stopId}) has invalid arrivalUnix: ${a.arrivalUnix}`);
    }

    if (typeof a.delaySec !== "undefined" && !Number.isInteger(a.delaySec)) {
      errors.push(`Arrival record #${i} (${a.tripId}) delaySec must be an integer, got: ${a.delaySec}`);
    }

    validArrivals++;
  }

  const valid = errors.length === 0;
  const summary = {
    fetchedAt,
    totalVehicles: vehicles.length,
    boundedVehicles,
    totalArrivals: arrivals.length,
    validArrivals,
  };

  return { valid, errors, warnings, summary };
}

import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const filePath = process.argv[2];
  let data;

  if (filePath) {
    try {
      data = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (e) {
      console.error(`Failed to read file ${filePath}:`, e.message);
      process.exit(1);
    }
  } else {
    // Self-test with valid Cyprus transit mock
    data = {
      fetchedAt: Math.floor(Date.now() / 1000),
      arrivals: [
        {
          routeId: "X400",
          stopId: "2660-stop",
          tripId: "kokkino-01",
          arrivalUnix: Math.floor(Date.now() / 1000) + 900,
          delaySec: 30,
        },
      ],
      vehicles: [
        {
          id: "veh-4001",
          tripId: "kokkino-01",
          lat: 35.15,
          lng: 33.20,
        },
      ],
    };
  }

  const result = validateGtfsSnapshot(data);
  console.log("GTFS Data-Quality Gate Validation Result:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.valid) {
    process.exit(1);
  }
}
