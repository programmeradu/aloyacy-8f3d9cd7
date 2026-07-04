import { defineMcp } from "@lovable.dev/mcp-js";
import searchStops from "./tools/search-stops";
import getStopArrivals from "./tools/get-realtime";
import planTrip from "./tools/plan-trip";
import watchStopArrivals from "./tools/watch-stop";

export default defineMcp({
  name: "aloya-mcp",
  title: "Aloya — Cyprus Transit",
  version: "0.2.0",
  instructions:
    "Tools for Aloya, a Cyprus bus navigation app. Use `search_stops` to look up stops, `get_stop_arrivals` for a one-shot live ETA snapshot, `watch_stop_arrivals` to long-poll for the next meaningful update (prefer this over repeated polling — the user does not need to reprompt), and `plan_trip` to parse a natural-language trip request. Every arrivals response includes `validUntilUnix`; refetch after that timestamp.",
  tools: [searchStops, getStopArrivals, planTrip, watchStopArrivals],
});
