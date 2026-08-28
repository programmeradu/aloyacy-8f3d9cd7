// One-tap stop condition. Same numbers as the web stop page.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import {
  nextStopAsk,
  stopAskChoiceLabel,
  stopAskChoices,
  stopConditionAsk,
  stopConditionChip,
  type StopAttribute,
  type StopConsensus,
} from "@aloya/core/stop-condition";
import { StopPhoto } from "@/components/stop/StopPhoto";
import { StopSkipAsk } from "@/components/stop/StopSkipAsk";
import { StopSkipRate } from "@/components/stop/StopSkipRate";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/push";

async function postCondition(body: unknown): Promise<StopConsensus[]> {
  const res = await fetch(`${API_BASE}/api/public/stop-condition`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stop-condition ${res.status}`);
  const json = (await res.json()) as { rows?: StopConsensus[] };
  return json.rows ?? [];
}

export function StopCondition({ stopId }: { stopId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stop-condition", stopId],
    queryFn: () => postCondition({ action: "get", stopId }),
    staleTime: 60_000,
  });
  const rows = q.data ?? [];
  const ask = nextStopAsk(rows);
  const choices = ask ? (stopAskChoices(ask) ?? []) : [];
  const report = useMutation({
    mutationFn: async (input: { attribute: StopAttribute; value: string }) =>
      postCondition({
        action: "report",
        deviceId: await getOrCreateDeviceId(),
        stopId,
        attribute: input.attribute,
        value: input.value,
      }),
    onSuccess: (next) => qc.setQueryData(["stop-condition", stopId], next),
  });
  const chips = rows
    .map((r) => {
      const label = stopConditionChip(r.attribute, r.value);
      if (!label) return null;
      return { label, n: r.n, source: r.source, id: `${r.attribute}:${r.value}` };
    })
    .filter((c): c is { label: string; n: number; source: StopConsensus["source"]; id: string } => c != null);

  if (chips.length === 0 && !ask) {
    return (
      <>
        <StopSkipRate stopId={stopId} />
        <StopSkipAsk stopId={stopId} />
        <StopPhoto stopId={stopId} rows={rows} />
      </>
    );
  }
  const askLine = ask ? stopConditionAsk(ask) : null;

  return (
    <View style={{ marginBottom: 16 }}>
      {chips.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {chips.map((c) => (
            <Text
              key={c.id}
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: palette.inkSoft,
              }}
            >
              {c.label}
              {c.source === "riders" && c.n >= 2 ? ` · ${c.n} riders` : ""}
            </Text>
          ))}
        </View>
      )}
      {ask && askLine && choices.length > 0 ? (
        <View style={{ marginTop: 12, gap: 10 }}>
          <Text style={{ fontFamily: "Geist_500Medium", fontSize: 13, color: palette.ink }}>
            {askLine}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {choices.map((value, i) => (
              <Pressable
                key={value}
                disabled={report.isPending}
                onPress={() => report.mutate({ attribute: ask, value })}
                style={{
                  backgroundColor: i === 0 ? palette.ink : palette.white,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: i === 0 ? 0 : 1,
                  borderColor: palette.line,
                  opacity: report.isPending ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Geist_600SemiBold",
                    fontSize: 12,
                    color: i === 0 ? palette.limestone : palette.ink,
                  }}
                >
                  {stopAskChoiceLabel(value) ?? value}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <StopSkipRate stopId={stopId} />
      <StopSkipAsk stopId={stopId} />
      <StopPhoto stopId={stopId} rows={rows} />
    </View>
  );
}
