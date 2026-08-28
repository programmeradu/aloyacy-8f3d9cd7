// One-tap stop condition. Same numbers as the web stop page.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { nextStopAsk, type StopAttribute, type StopConsensus } from "@aloya/core/stop-condition";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/push";

const CHIP: Record<string, string> = {
  "has_shelter:yes": "Shelter",
  "has_shelter:no": "No shelter",
  "has_seating:yes": "Seating",
  "has_seating:no": "No seating",
  "wheelchair_access:yes": "Step-free",
};

const ASK: Record<string, string> = {
  has_shelter: "Shelter here?",
  has_seating: "A seat here?",
};

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
  const report = useMutation({
    mutationFn: async (input: { attribute: StopAttribute; value: "yes" | "no" }) =>
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
      const label = CHIP[`${r.attribute}:${r.value}`];
      if (!label) return null;
      return { label, n: r.n, source: r.source, id: `${r.attribute}:${r.value}` };
    })
    .filter((c): c is { label: string; n: number; source: StopConsensus["source"]; id: string } => c != null);

  if (chips.length === 0 && !ask) return null;

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
      {ask && ASK[ask] ? (
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ fontFamily: "Geist_500Medium", fontSize: 13, color: palette.ink, flex: 1 }}>
            {ASK[ask]}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              disabled={report.isPending}
              onPress={() => report.mutate({ attribute: ask, value: "yes" })}
              style={{
                backgroundColor: palette.ink,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                opacity: report.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.limestone }}>
                Yes
              </Text>
            </Pressable>
            <Pressable
              disabled={report.isPending}
              onPress={() => report.mutate({ attribute: ask, value: "no" })}
              style={{
                backgroundColor: palette.white,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: palette.line,
                opacity: report.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.ink }}>
                No
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
