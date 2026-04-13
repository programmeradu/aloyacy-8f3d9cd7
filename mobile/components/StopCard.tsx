// Mobile StopCard — native mirror of `src/components/StopCard.tsx`.
//
// Renders one nearby stop: code, name, distance/headsign chip line,
// next ETA numeral, and trust tier chip. Tap → /stop/[stopId].
// Keeps semantic parity with web: tier chip drives numeral colour,
// ghost replaces the number with "—", live/rider-confirmed get accent.

import { Pressable, View, Text } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { RouteChip } from "@/components/RouteChip";
import { ConfidenceIcon } from "@/components/ConfidenceIcon";
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
        padding: 18,
        transform: [{ translateY: pressed ? -1 : 0 }],
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <View>
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 9.5,
                letterSpacing: 1.8,
                color: "rgba(90,87,78,0.7)",
                textTransform: "uppercase",
              }}
            >
              Stop {stop.code}
            </Text>
            <Text
              style={{
                fontFamily: "BricolageGrotesque_700Bold",
                fontSize: 20,
                lineHeight: 24,
                letterSpacing: -0.3,
                color: palette.ink,
                marginTop: 2,
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
                marginTop: 4,
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
