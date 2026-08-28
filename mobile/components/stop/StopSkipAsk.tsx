// D2 rider "it drove past me". Same number as the web stop page.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import {
  shouldAskSkipReport,
  shouldSpeakSkipReport,
  skipReportAsk,
  skipReportLine,
  skipReportYes,
  type SkipReportTally,
} from "@aloya/core/skip-report";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/push";

async function postReport(body: unknown): Promise<SkipReportTally> {
  const res = await fetch(`${API_BASE}/api/public/stop-skip-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stop-skip-report ${res.status}`);
  const json = (await res.json()) as { tally?: SkipReportTally };
  return json.tally ?? { n: 0, deviceReported: false };
}

export function StopSkipAsk({ stopId }: { stopId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stop-skip-report", stopId],
    queryFn: async () =>
      postReport({ action: "get", stopId, deviceId: await getOrCreateDeviceId() }),
    staleTime: 60_000,
  });
  const tally = q.data ?? { n: 0, deviceReported: false };
  const speak = shouldSpeakSkipReport(tally.n);
  const ask = shouldAskSkipReport(tally.deviceReported);
  const report = useMutation({
    mutationFn: async () =>
      postReport({
        action: "report",
        stopId,
        deviceId: await getOrCreateDeviceId(),
      }),
    onSuccess: (next) => qc.setQueryData(["stop-skip-report", stopId], next),
  });
  if (!speak && !ask) return null;

  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      {speak ? (
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 18,
            color: palette.ink,
          }}
        >
          {skipReportLine()}
        </Text>
      ) : null}
      {ask ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 18,
              color: palette.ink,
            }}
          >
            {skipReportAsk()}
          </Text>
          <Pressable
            disabled={report.isPending}
            onPress={() => report.mutate()}
            style={{
              alignSelf: "flex-start",
              backgroundColor: palette.ink,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              opacity: report.isPending ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 12,
                color: palette.limestone,
              }}
            >
              {skipReportYes()}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
