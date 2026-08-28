// E2. A route page is worth indexing only when the clock is rated.
// A name and a timetable is thin. Fail closed.

import { STOP_INDEX_RATED_MIN } from "./stop-index";

/** Same bar as the reliability badge. Do not invent a second number. */
export const ROUTE_INDEX_RATED_MIN = STOP_INDEX_RATED_MIN;

export function routeIndexable(sampleCount: number): boolean {
  return Number.isFinite(sampleCount) && sampleCount >= ROUTE_INDEX_RATED_MIN;
}
