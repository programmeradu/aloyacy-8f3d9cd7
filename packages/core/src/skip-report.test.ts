import { describe, expect, it } from "vitest";
import { stop as stopEn } from "./dictionaries/en/stop";
import {
  SKIP_REPORT_MIN_N,
  shouldAskSkipReport,
  shouldSpeakSkipReport,
  skipReportAsk,
  skipReportLine,
  skipReportYes,
  tallySkipReports,
  type SkipReportRow,
} from "./skip-report";

function row(deviceId: string): SkipReportRow {
  return { stopId: "1009", deviceId, reportedAt: 1 };
}

describe("tallySkipReports", () => {
  it("counts devices, not raw taps, and stays silent below two", () => {
    expect(SKIP_REPORT_MIN_N).toBe(2);
    expect(shouldSpeakSkipReport(1)).toBe(false);
    expect(shouldSpeakSkipReport(2)).toBe(true);
    const one = tallySkipReports([row("a"), row("a")], "a");
    expect(one).toEqual({ n: 1, deviceReported: true });
    expect(shouldSpeakSkipReport(one.n)).toBe(false);
    const two = tallySkipReports([row("a"), row("b")], "c");
    expect(two).toEqual({ n: 2, deviceReported: false });
    expect(shouldSpeakSkipReport(two.n)).toBe(true);
    expect(shouldAskSkipReport(two.deviceReported)).toBe(true);
    expect(shouldAskSkipReport(true)).toBe(false);
  });
});

describe("copy", () => {
  it("says a bus passed, not a fare", () => {
    expect(skipReportLine()).toBe("Riders say a bus passed them here.");
    expect(skipReportAsk()).toBe("Did a bus drive past you?");
    expect(skipReportYes()).toBe("It drove past");
    expect(stopEn["stop.skipReport"]).toBe("Riders say a bus passed them here.");
    expect(stopEn["stop.skipReportAsk"]).toBe("Did a bus drive past you?");
    expect(stopEn["stop.skipReportYes"]).toBe("It drove past");
    expect([skipReportLine(), skipReportAsk(), skipReportYes()].join(" ")).not.toMatch(
      /€|taxi|RAPTOR|Green Line|luggage|This 31/i,
    );
  });
});
