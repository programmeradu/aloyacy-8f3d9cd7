// Mobile DepartureRow — 1:1 semantic mirror of `src/components/DepartureRow.tsx`.
//
// Single source of truth per signal: one tier chip, one ETA numeral, one
// schedule clock, the band only when it's materially wider than the
// headline, the operator strike-through only when the live ETA disagrees.
//
// Renders a press target that deep-links to /trip-info/[tripId]. Designed
// to read cleanly from 320pt up — generous padding, monospaced micro-meta,
// editorial typography, no truncation on the destination headline.

import { Pressable, View, Text } from "react-native";
import { palette } from "@/constants/theme";
import { RouteChip } from "@/components/RouteChip";
import { ConfidenceIcon } from "@/components/ConfidenceIcon";
import {
  type FreshnessTier,
  type FreshnessConfidence,
} from "@/lib/freshness";

type Props = {
  tripId: string;
  routeId: string;
  routeShort: string;
  routeLong: string;
  routeColor?: string;
  /** Trip-level headsign from GTFS trips.txt when available. Preferred
   *  over parsing the route long name — disambiguates opposite directions
   *  of the same route (e.g. "19 → Lakatamia" vs "19 → City Center"). */
  headsign?: string | null;
  stopId: string;
  arrivalUnix: number;
  eta: {
    etaMin: number | null;
    band?: string;
    tier: FreshnessTier;
    confidence: FreshnessConfidence;
    operatorEtaMin?: number;
  };
  /** Tap target. Defaults to navigating to the trip-info screen via the
   *  parent screen — caller decides because not every host wants this. */
  onPress?: () => void;
};

const TIER_LABEL: Record<FreshnessTier, string> = {
  live: "LIVE",
  "rider-confirmed": "RIDER",
  predicted: "PREDICTED",
  ghost: "NO GPS",
  scheduled: "SCHEDULED",
};

// Mirror of web `tierAccent` → RN palette colours.
const TIER_COLOR: Record<FreshnessTier, string> = {
  live: palette.aegeanDeep,
  "rider-confirmed": palette.aegeanDeep,
  predicted: palette.ochre,
  ghost: "rgba(90,87,78,0.6)",
  scheduled: palette.inkSoft,
};

export function DepartureRow({
  tripId,
  routeId,
  routeShort,
  routeLong,
  routeColor,
  headsign,
  stopId,
  arrivalUnix,
  eta,
  onPress,
}: Props) {
  void tripId;
  void routeId;
  void stopId;
  const tierColor = TIER_COLOR[eta.tier];
  const tierLabel = TIER_LABEL[eta.tier];

  const isLiveish =
    eta.tier === "live" ||
    eta.tier === "rider-confirmed" ||
    eta.tier === "predicted";

  const shifted =
    isLiveish &&
    eta.etaMin != null &&
    eta.operatorEtaMin != null &&
    eta.operatorEtaMin !== eta.etaMin;

  const showBand =
    eta.tier !== "ghost" &&
    eta.tier !== "scheduled" &&
    !!eta.band &&
    bandIsInformative(eta.band, eta.etaMin);

  const clock = formatClock(arrivalUnix);
  const fallback = splitLongName(routeLong);
  const origin = fallback[0];
  const destination = (headsign && headsign.trim()) || fallback[1];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        transform: [{ translateY: pressed && onPress ? -1 : 0 }],
      })}
    >
      <View style={{ padding: 18 }}>
        {/* Top row: route chip · journey title · ETA numeral */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <View style={{ alignItems: "center", gap: 4 }}>
            <RouteChip short={routeShort} color={routeColor} />
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 8.5,
                letterSpacing: 2,
                color: "rgba(90,87,78,0.75)",
                textTransform: "uppercase",
              }}
            >
              Route
            </Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            {destination ? (
              <>
                <Text
                  style={{
                    fontFamily: "JetBrainsMono_500Medium",
                    fontSize: 9,
                    letterSpacing: 2,
                    color: "rgba(31,108,130,0.85)",
                    textTransform: "uppercase",
                  }}
                  numberOfLines={1}
                >
                  Headed to
                </Text>
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 18,
                    lineHeight: 21,
                    letterSpacing: -0.3,
                    color: palette.ink,
                    marginTop: 2,
                  }}
                  numberOfLines={2}
                >
                  {destination}
                </Text>
              </>
            ) : (
              <Text
                style={{
                  fontFamily: "BricolageGrotesque_700Bold",
                  fontSize: 18,
                  lineHeight: 21,
                  letterSpacing: -0.3,
                  color: palette.ink,
                }}
                numberOfLines={2}
              >
                {origin}
              </Text>
            )}
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 10,
                letterSpacing: 1.6,
                color: palette.inkSoft,
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              Scheduled {clock}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", paddingLeft: 4 }}>
            <Text
              style={{
                fontFamily: "BricolageGrotesque_800ExtraBold",
                fontSize: 38,
                lineHeight: 40,
                letterSpacing: -1,
                color: tierColor,
                fontVariant: ["tabular-nums"],
              }}
            >
              {eta.etaMin ?? "—"}
            </Text>
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 9,
                letterSpacing: 2,
                color: "rgba(90,87,78,0.8)",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {eta.etaMin != null ? "min" : "no gps"}
            </Text>
          </View>
        </View>

        {/* Hairline + meta strip */}
        <View
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "rgba(31,30,24,0.06)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 10,
                letterSpacing: 1.6,
                color: tierColor,
                textTransform: "uppercase",
              }}
            >
              {tierLabel}
            </Text>
            {isLiveish ? <ConfidenceIcon confidence={eta.confidence} /> : null}
          </View>

          {showBand || shifted ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              {showBand ? (
                <Text
                  style={{
                    fontFamily: "JetBrainsMono_500Medium",
                    fontSize: 10,
                    letterSpacing: 1.4,
                    color: "rgba(90,87,78,0.85)",
                    textTransform: "uppercase",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {eta.band}
                </Text>
              ) : null}
              {shifted ? (
                <Text
                  style={{
                    fontFamily: "JetBrainsMono_500Medium",
                    fontSize: 10,
                    letterSpacing: 1.4,
                    color: "rgba(90,87,78,0.5)",
                    textTransform: "uppercase",
                    textDecorationLine: "line-through",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  op {eta.operatorEtaMin}m
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function bandIsInformative(band: string, headlineMin: number | null): boolean {
  if (!band.includes("–")) return false;
  const m = band.match(/^(\d+)\s*–\s*(\d+)/);
  if (!m) return true;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (hi - lo <= 1) return false;
  if (
    headlineMin != null &&
    Math.abs(lo - headlineMin) <= 1 &&
    Math.abs(hi - headlineMin) <= 1
  )
    return false;
  return true;
}

function formatClock(unix: number): string {
  const d = new Date(unix * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function splitLongName(long: string): [string, string | null] {
  if (!long) return ["", null];
  const parts = long.split(/\s+[—-]\s+/);
  if (parts.length >= 2) {
    return [parts[0].trim(), parts.slice(1).join(" — ").trim()];
  }
  return [long, null];
}
