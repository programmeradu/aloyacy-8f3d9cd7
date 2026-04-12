// App Tracking Transparency prompt.
//
// We only ask once, on first launch after onboarding (or on first open of
// a screen that would benefit from analytics). The actual analytics SDK is
// not wired yet — this hook just records the user's decision so the rest
// of the app can gate any future tracking on it.
//
// Apple requires the prompt before any tracking-eligible identifier (IDFA,
// cross-app attribution) is read. We're conservative: if the user denies or
// the API is unavailable, we treat tracking as off.

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from "expo-tracking-transparency";

const KEY = "aloya.att.decision.v1";

export type TrackingState =
  | { status: "unknown" }
  | { status: "granted" }
  | { status: "denied" }
  | { status: "unavailable" };

export async function ensureTrackingDecision(): Promise<TrackingState> {
  // Android + web: no ATT surface. Behave like "unavailable" so callers
  // skip the prompt and fall back to first-party-only signals.
  if (Platform.OS !== "ios") {
    await AsyncStorage.setItem(KEY, "unavailable");
    return { status: "unavailable" };
  }
  try {
    const current: PermissionResponse = await getTrackingPermissionsAsync();
    if (current.status === "granted") {
      await AsyncStorage.setItem(KEY, "granted");
      return { status: "granted" };
    }
    if (current.status === "denied" && !current.canAskAgain) {
      await AsyncStorage.setItem(KEY, "denied");
      return { status: "denied" };
    }
    const next = await requestTrackingPermissionsAsync();
    const status = next.status === "granted" ? "granted" : "denied";
    await AsyncStorage.setItem(KEY, status);
    return { status };
  } catch {
    return { status: "unavailable" };
  }
}

export function useTrackingDecision(autoPrompt = false): TrackingState {
  const [state, setState] = useState<TrackingState>({ status: "unknown" });
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await AsyncStorage.getItem(KEY);
      if (stored === "granted" || stored === "denied" || stored === "unavailable") {
        if (alive) setState({ status: stored });
        return;
      }
      if (!autoPrompt) return;
      const result = await ensureTrackingDecision();
      if (alive) setState(result);
    })();
    return () => {
      alive = false;
    };
  }, [autoPrompt]);
  return state;
}
