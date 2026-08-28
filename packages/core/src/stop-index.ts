// D5. A stop page is worth indexing only when we have something true to say.
// A name and a timetable is thin. Fail closed.

/** Same bar as route reliability — below this the clock is unknown. */
export const STOP_INDEX_RATED_MIN = 30;

export type StopIndexFacts = {
  ratedReliability: boolean;
  skipSpeaks: boolean;
  confirmedAttribute: boolean;
};

export function stopIndexable(facts: StopIndexFacts): boolean {
  return facts.ratedReliability || facts.skipSpeaks || facts.confirmedAttribute;
}
