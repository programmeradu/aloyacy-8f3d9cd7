// Shared shapes for the "Cyprus today" briefing.

export type TodayTheme =
  "derby" | "festival" | "holiday" | "cruise" | "heatwave" | "storm" | "calm";

export type TodayTileKind =
  | "match"
  | "festival"
  | "cruise"
  | "holiday"
  | "nameday"
  | "rhythm"
  | "weather-sun"
  | "weather-rain"
  | "weather-cloud";

export type TodayTile = {
  kind: TodayTileKind;
  kicker: string;
  kickerEl: string;
  title: string;
  titleEl: string;
  detail: string;
  detailEl: string;
  accent: "ochre" | "aegean" | "olive" | "ink";
};

export type TodayFocus = { city: string; cityEl: string; scope: "island" | "city" | "trip" };

export type TodayFact = { en: string; el: string; tag: "local" | "tourist" };
export type GreekWord = { el: string; translit: string; en: string; meaning: string };

export type TodayBriefing = {
  generatedAt: number;
  theme: TodayTheme;
  /** Hand-painted gouache hero key — pick from src/assets/today-{theme}.jpg */
  heroKey: TodayTheme;
  /** ISO local Cyprus date, YYYY-MM-DD. */
  date: string;
  weekday: { en: string; el: string };
  headline: { en: string; el: string };
  lede: { en: string; el: string };
  tiles: TodayTile[];
  verdict: { en: string; el: string };
  fact: TodayFact;
  greekWord: GreekWord;
  focus: TodayFocus;
};

export type TodayInput = {
  /** Rider's current coords — used for localised weather. */
  lat?: number;
  lng?: number;
  /** Active trip destination — biases briefing toward the destination city. */
  destLat?: number;
  destLng?: number;
  /** Optional explicit destination city label, e.g. "Limassol". */
  destCity?: string;
};

export type Weather = { tempC: number; condition: string; iconKey: string } | null;
export type CruiseToday = {
  count: number;
  summary: string | null;
  totalPassengers: number | null;
} | null;
export type Fixture = {
  venue: string;
  venueEl: string;
  city: string;
  cityEl: string;
  routes: string[];
};
export type Festival = { name: string; nameEl: string; city: string };
