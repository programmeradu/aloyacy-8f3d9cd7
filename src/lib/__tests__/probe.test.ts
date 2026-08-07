import { it } from "vitest";
import { getItineraryTrafficAlerts as f } from "/dev-server/src/lib/traffic-alerts.functions";
it("probe", () => {
  console.log(Object.keys(f as any), Object.keys((f as any).options ?? {}));
});
