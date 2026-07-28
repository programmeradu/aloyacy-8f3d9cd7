// Static chrome for the route detail screen: top bar, section headers and the
// bespoke "quiet line" vignette shown when nothing is moving yet.

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import Svg, { Path, Defs, LinearGradient, Stop as SvgStop } from "react-native-svg";

import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";

export const MONO_KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
};

export function RouteTopBar() {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingBottom: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 18,
            color: palette.ink,
            marginTop: -2,
          }}
        >
          ←
        </Text>
      </Pressable>
      <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>OVERVIEW</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

export function SectionHeader({ title, kicker }: { title: string; kicker: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 10,
        gap: 12,
      }}
    >
      <Text
        style={{
          flexShrink: 1,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 22,
          color: palette.ink,
          letterSpacing: -0.4,
        }}
      >
        {title}
      </Text>
      <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>{kicker}</Text>
    </View>
  );
}

export function QuietVignette({ loading }: { loading: boolean }) {
  return (
    <View
      style={{
        height: 224,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.limestoneSoft,
      }}
    >
      {/* Bespoke SVG vignette — horizon road into limestone hills, no stock art */}
      <Svg width="100%" height="100%" viewBox="0 0 400 224" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <SvgStop offset="0%" stopColor={palette.aegeanSoft} stopOpacity="0.9" />
            <SvgStop offset="100%" stopColor={palette.limestoneSoft} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="ochreFade" x1="0" y1="0" x2="1" y2="0">
            <SvgStop offset="0%" stopColor={palette.ochre} stopOpacity="0.35" />
            <SvgStop offset="100%" stopColor={palette.ochre} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d="M0 0 H400 V140 Q200 110 0 150 Z" fill="url(#sky)" />
        <Path d="M0 150 Q200 110 400 140 V224 H0 Z" fill={palette.limestoneSoft} />
        <Path
          d="M-20 200 Q140 140 220 160 T440 130"
          stroke="url(#ochreFade)"
          strokeWidth={38}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M-20 200 Q140 140 220 160 T440 130"
          stroke={palette.ochre}
          strokeOpacity={0.45}
          strokeWidth={1.2}
          strokeDasharray="6 9"
          fill="none"
        />
        <Path
          d="M30 130 Q80 70 130 130 Q180 75 230 130 Q280 70 330 130"
          stroke={palette.oliveSoft}
          strokeOpacity={0.4}
          strokeWidth={1}
          fill="none"
        />
      </Svg>
      <View style={{ position: "absolute", left: 18, right: 18, bottom: 16 }}>
        <Text style={[MONO_KICKER, { color: palette.inkSoft }]}>SERVICE WINDOW</Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 20,
            color: palette.ink,
            letterSpacing: -0.4,
          }}
        >
          {loading ? "Checking the line…" : "Quiet on this line right now"}
        </Text>
      </View>
    </View>
  );
}

export function StopsPendingCard() {
  return (
    <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
      <Card style={{ padding: 22 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 18,
            color: palette.ink,
          }}
        >
          Stops will appear here
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
          }}
        >
          When this line has a live trip in the feed, the full stop sequence loads
          here with the bus dot moving along it.
        </Text>
      </Card>
    </View>
  );
}
