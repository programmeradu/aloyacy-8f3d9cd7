import { fetchRealtime } from "./src/lib/gtfs-rt.server";

async function main() {
  try {
    console.log("Fetching realtime data...");
    const snap = await fetchRealtime();
    console.log("FetchedAt:", new Date(snap.fetchedAt * 1000).toISOString());
    console.log("Vehicles count:", snap.vehicles.length);
    console.log("Arrivals count:", snap.arrivals.length);
    console.log("Stale:", snap.stale);
    if (snap.error) console.log("Error:", snap.error);
    
    if (snap.vehicles.length > 0) {
      console.log("Sample vehicle:", snap.vehicles[0]);
    }
  } catch (e) {
    console.error("Audit failed:", e);
  }
}

main();
