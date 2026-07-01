// Mobile StopCard — editorial mirror of `src/components/StopCard.tsx`.
//
// Layered composition: a limestone card ground with a Cyprus stop-shelter
// photograph washed on the right for visual anchor, an aegean rail on the
// left, and the numeric ETA at 44pt so it reads at a glance. Same tier
// logic as the web card — LIVE/RIDER get accent, ghost replaces the number
// with an em-dash.

import { Pressable, View, Text, Image, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { RouteChip } from "@/components/RouteChip";
import { StopCode } from "@/components/StopCode";
import { ConfidenceIcon } from "@/components/ConfidenceIcon";
import { assets } from "@/lib/assets";
import {
  type FreshnessTier,
  type FreshnessConfidence,
} from "@/lib/freshness";

type Tone = "aegean" | "ochre" | "olive";

export type StopCardRoute = {
  code: string;
  tone: Tone;
  color?: string;
  headsign?: string | null;
};

export type StopCardData = {
  id: string;
  code: string;
  name: string;
  towards: string;
  etaMin: number | null;
  etaTier?: FreshnessTier;
  etaConfidenceLevel?: FreshnessConfidence;
  etaBlurb?: string;
  routes: StopCardRoute[];
  highlight?: boolean;
};

const TIER_LABEL: Record<FreshnessTier, string> = {
  live: "LIVE",
  "rider-confirmed": "RIDER",
  predicted: "PREDICTED",
  ghost: "NO GPS",
  scheduled: "SCHEDULED",
};

const TIER_COLOR: Record<FreshnessTier, string> = {
  live: palette.aegeanDeep,
  "rider-confirmed": palette.aegeanDeep,
  predicted: palette.ochre,
  ghost: "rgba(90,87,78,0.6)",
  scheduled: palette.inkSoft,
};

export function StopCard({ stop }: { stop: StopCardData }) {
  const tier: FreshnessTier = stop.etaTier ?? "scheduled";
  const isGhost = tier === "ghost";
  const accent = TIER_COLOR[tier];
  const displayMin = stop.etaMin == null || isGhost ? null : stop.etaMin;
  const showTier = stop.etaMin != null;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        router.push(`/stop/${stop.id}`);
      }}
      style={({ pressed }) => ({
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        transform: [{ translateY: pressed ? -1 : 0 }],
      })}
    >
      {/* Editorial photo wash on the right edge — the shelter photograph
          leans into the card so the composition feels rooted in place. */}
      <View pointerEvents="none" style={cardStyles.washWrap}>
        <Image
          source={assets.stop_shelter}
          style={cardStyles.washImage}
          resizeMode="cover"
        />
        <View style={cardStyles.washTint} />
      </View>
      {/* Left rail — accent colour drives from the freshness tier. */}
      <View style={[cardStyles.rail, { backgroundColor: accent }]} pointerEvents="none" />

      <View style={{ padding: 18, paddingLeft: 22, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
          <View style={{ gap: 6 }}>
            <StopCode code={stop.code} />
            <Text
              style={{
                fontFamily: "BricolageGrotesque_800ExtraBold",
                fontSize: 21,
                lineHeight: 25,
                letterSpacing: -0.4,
                color: palette.ink,
              }}
              numberOfLines={2}
            >
              {stop.name}
            </Text>
            <Text
              style={{
                fontFamily: "Geist_500Medium",
                fontSize: 12,
                color: palette.inkSoft,
                letterSpacing: -0.1,
              }}
              numberOfLines={1}
            >
              {stop.towards}
            </Text>
          </View>


          <RouteList routes={stop.routes} />
        </View>

        <View style={{ alignItems: "flex-end", gap: 4, minWidth: 64 }}>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 44,
              lineHeight: 46,
              letterSpacing: -1.4,
              color: accent,
              fontVariant: ["tabular-nums"],
            }}
          >
            {displayMin == null ? "—" : displayMin}
          </Text>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 9,
              letterSpacing: 1.8,
              color: "rgba(90,87,78,0.75)",
              textTransform: "uppercase",
            }}
          >
            {displayMin == null ? (isGhost ? "no gps" : "no bus") : "min away"}
          </Text>
          {showTier && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 9,
                  letterSpacing: 1.8,
                  color: TIER_COLOR[tier],
                  textTransform: "uppercase",
                }}
              >
                {TIER_LABEL[tier]}
              </Text>
              {(tier === "live" ||
                tier === "rider-confirmed" ||
                tier === "predicted") &&
              stop.etaConfidenceLevel ? (
                <ConfidenceIcon confidence={stop.etaConfidenceLevel} />
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function RouteList({ routes }: { routes: StopCardRoute[] }) {
  if (routes.length === 0) return null;
  const compact = routes.length > 3;
  if (!compact) {
    return (
      <View style={{ gap: 6 }}>
        {routes.map((r, i) => (
          <View
            key={`${r.code}|${r.headsign ?? ""}|${i}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <RouteChip short={r.code} color={r.color} />
            {r.headsign ? (
              <Text
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 10,
                  letterSpacing: 1.4,
                  color: palette.inkSoft,
                  textTransform: "uppercase",
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                → {r.headsign}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  }
  // Compact: chips in a wrapped row + destination summary
  const dests = Array.from(
    new Set(routes.map((r) => r.headsign).filter(Boolean) as string[]),
  ).slice(0, 2);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {routes.map((r, i) => (
          <RouteChip
            key={`${r.code}|${i}`}
            short={r.code}
            color={r.color}
          />
        ))}
      </View>
      {dests.length > 0 && (
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 1.4,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
          numberOfLines={1}
        >
          → {dests.join("  ")}
        </Text>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  washImage: {
    position: "absolute",
    right: -20,
    top: -10,
    bottom: -10,
    width: "55%",
    opacity: 0.14,
  },
  washTint: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  rail: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderRadius: 4,
  },
});

