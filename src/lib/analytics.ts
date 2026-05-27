// Fire-and-forget client analytics. Forwards to logTrainingEvent so we
// reuse the existing training_events table — no new schema. Events use
// a `ui:<surface>.<action>` or `ai:<surface>.<action>` convention.
//
// Examples:
//   track("ui:nl-planner.impression")
//   track("ai:nl-planner.parsed", { confidence: 0.8 })
//   track("ui:commute-card.tap", { hasPreview: true })
//
// Failures are swallowed so telemetry never breaks the UI.

import { logTrainingEvent } from "@/lib/training.functions";
import { getDeviceId } from "@/lib/pwa";

type EventName = `ui:${string}` | `ai:${string}`;
type Payload = Record<string, unknown>;

// Per-session dedupe so impression events don't spam on every re-render.
const seen = new Set<string>();

export function track(event: EventName, payload: Payload = {}): void {
  if (typeof window === "undefined") return;
  try {
    const deviceId = getDeviceId();
    void logTrainingEvent({ data: { deviceId, kind: event, payload } }).catch(
      () => {},
    );
  } catch {
    // ignore
  }
}

/** Track an impression at most once per session per key. */
export function trackImpression(
  event: EventName,
  payload: Payload = {},
  key?: string,
): void {
  const k = key ?? event;
  if (seen.has(k)) return;
  seen.add(k);
  track(event, payload);
}
