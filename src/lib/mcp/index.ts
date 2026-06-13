import { defineMcp } from "@lovable.dev/mcp-js";
import searchStops from "./tools/search-stops";
import getStopArrivals from "./tools/get-realtime";
import planTrip from "./tools/plan-trip";

export default defineMcp({
  name: "aloya-mcp",
  title: "Aloya — Cyprus Transit",
  version: "0.1.0",
  instructions:
    "Tools for Aloya, a Cyprus bus navigation app. Use `search_stops` to look up bus stops across Cyprus (Nicosia, Limassol, Larnaca, Paphos, Intercity), `get_stop_arrivals` for live ETAs at a stop, and `plan_trip` to parse a natural-language trip request into a structured itinerary intent.",
  tools: [searchStops, getStopArrivals, planTrip],
});
