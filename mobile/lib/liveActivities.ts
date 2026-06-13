// Native Live Activities helper for Aloya (iOS).
//
// This module provides the bridge to start, update, and end iOS Live Activities.
// In a standard Expo environment, this requires a native module or a Config Plugin.
// Real ActivityKit calls happen in Swift; this JS helper prepares the data
// and interfaces with the native side (e.g., via a Expo Module).

import { Platform } from "react-native";

export type ActivityAttributes = {
  routeShort: string;
  stopName: string;
  destinationName: string;
};

export type ActivityState = {
  etaMinutes: number;
  phase: string;
  isStale: boolean;
};

/**
 * Starts a new Live Activity session for an active trip.
 */
export async function startLiveActivity(
  attributes: ActivityAttributes,
  initialState: ActivityState
): Promise<string | null> {
  if (Platform.OS !== "ios") return null;

  console.log("[LiveActivities] Requesting start", { attributes, initialState });

  // Note: Implementation requires a custom native module to call `ActivityKit`.
  // We mock the success for now to ensure the JS logic is sound.
  const _attr = attributes;
  const _state = initialState;
  return "activity-session-id";
}

/**
 * Updates an existing Live Activity with new ETA or phase data.
 */
export async function updateLiveActivity(
  activityId: string,
  state: ActivityState
): Promise<void> {
  if (Platform.OS !== "ios" || !activityId) return;

  console.log("[LiveActivities] Updating activity", activityId, state);
  const _id = activityId;
  const _state = state;
}

/**
 * Ends the Live Activity session when the trip is complete.
 */
export async function endLiveActivity(activityId: string): Promise<void> {
  if (Platform.OS !== "ios" || !activityId) return;

  console.log("[LiveActivities] Ending activity", activityId);
  const _id = activityId;
}
