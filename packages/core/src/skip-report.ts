// D2 rider "it drove past me". Append-only. Does not change the skip
// percentage — that stays a vehicle measurement. Silent below two devices.

export const SKIP_REPORT_MIN_N = 2;
export const SKIP_REPORT_WINDOW_DAYS = 14;
export const SKIP_REPORT_RATE_LIMIT_SEC = 60;

export type SkipReportRow = {
  stopId: string;
  deviceId: string;
  reportedAt: number;
};

export type SkipReportTally = {
  n: number;
  deviceReported: boolean;
};

export function tallySkipReports(
  rows: SkipReportRow[],
  deviceId: string | null,
): SkipReportTally {
  const devices = new Set<string>();
  for (const row of rows) {
    if (row.deviceId) devices.add(row.deviceId);
  }
  return {
    n: devices.size,
    deviceReported: deviceId != null && deviceId.length > 0 && devices.has(deviceId),
  };
}

export function shouldSpeakSkipReport(n: number): boolean {
  return n >= SKIP_REPORT_MIN_N;
}

export function shouldAskSkipReport(deviceReported: boolean): boolean {
  return !deviceReported;
}

export function skipReportLine(): string {
  return "Riders say a bus passed them here.";
}

export function skipReportAsk(): string {
  return "Did a bus drive past you?";
}

export function skipReportYes(): string {
  return "It drove past";
}
