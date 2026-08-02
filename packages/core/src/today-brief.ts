// Pure composition of the "Cyprus today" editorial briefing.
//
// Every function here is deterministic: date in, copy out. All live signals
// (weather, cruise calls, event feeds) are fetched by the caller and passed
// in, so this module is fully testable without network or database access.
// Implementation lives in ./today-brief/*; this file is the public surface.

export * from "./today-brief/types";
export * from "./today-brief/geo-time";
export * from "./today-brief/signals";
export * from "./today-brief/compose";
