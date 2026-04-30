import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import { Card } from "./Card";
import type { IntercityInsights, IntercityAnomaly } from "@/lib/wave3";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function fmtMinSec(sec: number): string {
  const abs = Math.abs(Math.round(sec));
  if (abs < 60) return `${abs}s`;
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function hourBand(h: number): string {
  const start = String(h).padStart(2, "0");
  const end = String((h + 1) % 24).padStart(2, "0");
  return `${start}:00–${end}:00`;
}

function Label({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: "Geist_700Bold",
        fontSize: 10,
        letterSpacing: 1,
        color: palette.oliveSoft,
      }}
    >
      {children}
    </Text>
  );
}

function AnomalyRow({ a, baseline }: { a: IntercityAnomaly; baseline: number }) {
  const headline = `${DAY_LONG[a.dayOfWeek]} · ${hourBand(a.hourOfDay)}`;
  const deltaLabel = `+${fmtMinSec(a.deltaFromBaselineSec)} vs route average`;
  const avgLabel = `Avg ${fmtMinSec(a.meanDelaySec)} late · ${a.sampleCount} runs`;
  const rel = a.meanDelaySec - baseline;
  return (
    <View
      style={{
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 15,
          color: palette.ink,
          letterSpacing: -0.2,
        }}
      >
        {headline}
      </Text>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          color: rel > 0 ? palette.ochre : palette.inkSoft,
          marginTop: 2,
        }}
      >
        {deltaLabel}
      </Text>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 11,
          color: palette.inkSoft,
          marginTop: 4,
        }}
      >
        {avgLabel}
      </Text>
    </View>
  );
}

export function IntercityPatternsCard({ data }: { data: IntercityInsights }) {
  if (data.tier === "unknown") return null;

  const wk = data.weekdayMeanDelaySec;
  const we = data.weekendMeanDelaySec;
  const delta = wk !== null && we !== null ? we - wk : null;
  const showSplit = delta !== null && Math.abs(delta) >= 60;

  return (
    <Card style={{ marginTop: 20, padding: 20 }}>
      <Label>WEEKLY PATTERNS</Label>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          lineHeight: 26,
          color: palette.ink,
          marginTop: 6,
          letterSpacing: -0.4,
        }}
      >
        {data.tier === "learning"
          ? "Still learning this route"
          : `${data.sampleCount.toLocaleString()} runs observed`}
      </Text>

      {data.tier === "learning" && (
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
            marginTop: 8,
            lineHeight: 19,
          }}
        >
          We won&apos;t claim a pattern until we&apos;ve seen enough runs to
          stand behind it.
        </Text>
      )}

      {data.tier === "rated" && (
        <>
          {showSplit && (
            <View
              style={{
                flexDirection: "row",
                marginTop: 18,
                gap: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <Label>WEEKDAY AVG</Label>
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_800ExtraBold",
                    fontSize: 28,
                    color: palette.ink,
                    marginTop: 4,
                    letterSpacing: -0.8,
                  }}
                >
                  {wk! >= 0 ? "+" : "−"}
                  {fmtMinSec(wk!)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Label>WEEKEND AVG</Label>
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_800ExtraBold",
                    fontSize: 28,
                    color: delta! > 0 ? palette.ochre : palette.ink,
                    marginTop: 4,
                    letterSpacing: -0.8,
                  }}
                >
                  {we! >= 0 ? "+" : "−"}
                  {fmtMinSec(we!)}
                </Text>
              </View>
            </View>
          )}

          {data.bestWindow && (
            <View style={{ marginTop: 18 }}>
              <Label>MOST RELIABLE WINDOW</Label>
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 15,
                  color: palette.ink,
                  marginTop: 4,
                }}
              >
                {DAY_SHORT[data.bestWindow.dayOfWeek]} · {hourBand(data.bestWindow.hourOfDay)}
              </Text>
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 11,
                  color: palette.inkSoft,
                  marginTop: 2,
                }}
              >
                Avg {fmtMinSec(data.bestWindow.meanDelaySec)} · {data.bestWindow.sampleCount} runs
              </Text>
            </View>
          )}

          {data.anomalies.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Label>RUN-TIMES TO PLAN AROUND</Label>
              {data.anomalies.map((a) => (
                <AnomalyRow
                  key={`${a.dayOfWeek}-${a.hourOfDay}`}
                  a={a}
                  baseline={data.baselineMeanDelaySec}
                />
              ))}
            </View>
          )}
        </>
      )}
    </Card>
  );
}
