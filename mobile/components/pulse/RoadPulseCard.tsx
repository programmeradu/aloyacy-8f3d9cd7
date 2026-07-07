// Pulse — "How the network is moving" card: on-time split, plain-language
// summary and the 24-hour activity comb.

import { View, Text, Image, StyleSheet } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import type { LivePulse, HourBucket } from "@/lib/pulse";
import { DISPLAY, DISPLAY_MED, SANS, MONO, EYEBROW } from "./kit";

export function RoadPulseCard({
  live,
  buckets,
  nowHour,
}: {
  live: LivePulse;
  buckets: HourBucket[];
  nowHour: number;
}) {
  const hasData = live.observations > 0;
  const medianMin = Math.round(live.medianDelaySec / 60);
  const maxCount = Math.max(1, ...buckets.map((b) => b.sampleCount));
  const totalToday = buckets.reduce((s, b) => s + b.sampleCount, 0);

  const summary =
    medianMin >= 1
      ? `Right now, buses are running about ${medianMin} min late on average.`
      : medianMin <= -1
        ? `Right now, buses are running about ${Math.abs(medianMin)} min early on average.`
        : "Right now, most buses are running on time.";

  return (
    <View style={{ marginTop: 22, paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        {/* Editorial illustration band */}
        <View style={{ position: "relative", width: "100%", aspectRatio: 16 / 7 }}>
          <Image
            source={assets.pulse_network_band}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Bottom fade into card */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "60%",
              backgroundColor: "transparent",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "100%",
                backgroundColor: palette.white,
                opacity: 0.55,
              }}
            />
          </View>

          {/* Kicker + title top-left */}
          <View
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              right: 18,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: EYEBROW,
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                Last 60 minutes
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: DISPLAY,
                  fontSize: 22,
                  lineHeight: 25,
                  color: palette.ink,
                  maxWidth: 180,
                }}
              >
                How the network is moving
              </Text>
            </View>

            {/* Floating on-time chip */}
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.94)",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: palette.line,
                paddingHorizontal: 12,
                paddingVertical: 8,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                <Text
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 32,
                    lineHeight: 32,
                    color: palette.aegeanDeep,
                    letterSpacing: -0.6,
                  }}
                >
                  {hasData ? live.onTimePct : "—"}
                </Text>
                <Text
                  style={{
                    fontFamily: EYEBROW,
                    fontSize: 10,
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                    color: palette.inkSoft,
                  }}
                >
                  %
                </Text>
              </View>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: EYEBROW,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                On time
              </Text>
            </View>
          </View>
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 22 }}>
          {hasData ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  height: 8,
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <View style={{ flex: live.latePct, backgroundColor: palette.ochre }} />
                <View style={{ flex: live.onTimePct, backgroundColor: palette.aegeanDeep }} />
                <View style={{ flex: live.earlyPct, backgroundColor: palette.olive }} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <PulseLeg color={palette.ochre} label="Late" pct={live.latePct} />
                <PulseLeg color={palette.aegeanDeep} label="On time" pct={live.onTimePct} />
                <PulseLeg color={palette.olive} label="Early" pct={live.earlyPct} />
              </View>
              <Text
                style={{
                  marginTop: 16,
                  fontFamily: SANS,
                  fontSize: 14,
                  lineHeight: 20,
                  color: palette.ink,
                }}
              >
                {summary}
              </Text>
            </>
          ) : (
            <View
              style={{
                borderRadius: 16,
                padding: 14,
                backgroundColor: palette.limestoneSoft,
                borderWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Text
                style={{
                  fontFamily: EYEBROW,
                  fontSize: 9.5,
                  letterSpacing: 2,
                  color: palette.inkSoft,
                  textTransform: "uppercase",
                }}
              >
                No live signal in the past hour
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: SANS,
                  fontSize: 13.5,
                  lineHeight: 19,
                  color: palette.ink,
                }}
              >
                Buses are between runs. The network wakes back up at first morning departure.
              </Text>
            </View>
          )}

          {buckets.length > 0 && totalToday > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text
                style={{
                  fontFamily: EYEBROW,
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                Bus activity today
              </Text>
              <View style={{ marginTop: 8 }}>
                <ActivityComb buckets={buckets} nowHour={nowHour} maxCount={maxCount} />
              </View>
              <View
                style={{
                  marginTop: 6,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                {["Morning", "Midday", "Evening", "Late"].map((l) => (
                  <Text
                    key={l}
                    style={{
                      fontFamily: EYEBROW,
                      fontSize: 9,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: palette.inkSoft,
                    }}
                  >
                    {l}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {hasData && (
            <Text
              style={{
                marginTop: 16,
                fontFamily: SANS,
                fontSize: 12,
                lineHeight: 17,
                color: palette.inkSoft,
              }}
            >
              {live.observations === 1
                ? "Based on 1 bus we checked in the last hour."
                : `Based on ${live.observations.toLocaleString()} buses we checked in the last hour.`}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function PulseLeg({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text
          style={{
            fontFamily: EYEBROW,
            fontSize: 9,
            letterSpacing: 1.6,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 4,
          fontFamily: DISPLAY_MED,
          fontSize: 16,
          color: palette.ink,
        }}
      >
        {pct}
        <Text style={{ fontFamily: MONO, fontSize: 10, color: palette.inkSoft }}>%</Text>
      </Text>
    </View>
  );
}

export function ActivityComb({
  buckets,
  nowHour,
  maxCount,
}: {
  buckets: HourBucket[];
  nowHour: number;
  maxCount: number;
}) {
  const w = 300;
  const h = 46;
  const cw = w / 24;
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {buckets.map((b) => {
        const bh = Math.max(2, (b.sampleCount / maxCount) * (h - 6));
        const x = b.hour * cw + cw * 0.2;
        const bw = cw * 0.6;
        const isNow = b.hour === nowHour;
        const late = b.meanDelaySec > 90;
        const early = b.meanDelaySec < -90;
        const color = late ? palette.ochre : early ? palette.olive : palette.aegeanDeep;
        return (
          <Rect
            key={b.hour}
            x={x}
            y={h - bh - 2}
            width={bw}
            height={bh}
            rx={1.2}
            fill={color}
            opacity={isNow ? 1 : 0.45}
          />
        );
      })}
      <Path
        d={`M${nowHour * cw + cw / 2} 0 L${nowHour * cw + cw / 2} ${h}`}
        stroke={palette.ink}
        strokeWidth={0.8}
        opacity={0.35}
      />
    </Svg>
  );
}
