// Native turn-by-turn walking guidance card. Native parity for
// `src/components/WalkGuidance.tsx` — same header (total time · distance),
// same ordered step list with Street View image, maneuver + distance chips,
// and highlighting for the current step during live tracking.
//
// Street View comes from the CORS-open `/api/public/streetview` endpoint
// — same source of truth the web app uses. When Street View 404s (no
// coverage), we fall back to a limestone panel with a maneuver glyph so
// the step still reads.

import { useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import type { WalkStep } from "@aloya/core/geo";
import { streetViewUrl } from "@/lib/walk";

function fmtDist(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

const KICKER = {
  fontFamily: "JetBrainsMono_500Medium" as const,
  fontSize: 10,
  letterSpacing: 1.8,
  textTransform: "uppercase" as const,
};

export function WalkGuidance({
  title,
  steps,
  totalDurationSec,
  totalDistanceMeters,
  activeStepIndex,
}: {
  title: string;
  steps: WalkStep[];
  totalDurationSec: number;
  totalDistanceMeters: number;
  /** Index of the step the rider is currently executing (from useJourney). */
  activeStepIndex?: number;
}) {
  if (!steps || steps.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 24,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          {title}
        </Text>
        <Text style={{ ...KICKER, color: palette.inkSoft, paddingBottom: 3 }}>
          {Math.max(1, Math.round(totalDurationSec / 60))} min ·{" "}
          {fmtDist(totalDistanceMeters)}
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        {steps.map((s, i) => (
          <TurnStep
            key={i}
            index={i + 1}
            step={s}
            last={i === steps.length - 1}
            active={activeStepIndex === i}
            done={activeStepIndex != null && i < activeStepIndex}
          />
        ))}
      </View>
    </View>
  );
}

function TurnStep({
  index,
  step,
  last,
  active,
  done,
}: {
  index: number;
  step: WalkStep;
  last: boolean;
  active: boolean;
  done: boolean;
}) {
  const [svFailed, setSvFailed] = useState(false);
  const url = streetViewUrl({
    lat: step.start.lat,
    lng: step.start.lng,
    heading: step.heading ?? 0,
  });
  const maneuver = (step.maneuver || "straight")
    .toLowerCase()
    .replace(/[-_]/g, " ");
  return (
    <Pressable
      onPress={() => Haptics.selectionAsync().catch(() => {})}
      style={({ pressed }) => ({
        overflow: "hidden",
        borderRadius: 24,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: active ? palette.aegeanDeep : palette.line,
        opacity: pressed ? 0.94 : done ? 0.55 : 1,
      })}
    >
      <View style={{ aspectRatio: 16 / 9, backgroundColor: palette.limestoneSoft }}>
        {svFailed ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
            <MapView
              height={9999 /* absorbed by flex; use 100% via wrapper */}
              center={{ lat: step.start.lat, lng: step.start.lng }}
              spanKm={0.3}
              liveVehicles={false}
              markers={[
                { lat: step.start.lat, lng: step.start.lng, kind: "pin", tone: "aegean", label: step.instruction },
              ]}
              fitToContent={false}
            />
          </View>
        ) : (
          <Image
            source={{ uri: url }}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
            onError={() => setSvFailed(true)}
          />
        )}
        <View
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            flexDirection: "row",
            gap: 8,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Text style={{ ...KICKER, color: palette.ink }}>
              {index.toString().padStart(2, "0")}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "rgba(31,30,24,0.85)",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Text style={{ ...KICKER, color: palette.limestone }}>{maneuver}</Text>
          </View>
        </View>
        <View
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            backgroundColor: "rgba(255,255,255,0.92)",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <Text style={{ ...KICKER, color: palette.ink }}>
            {fmtDist(step.distanceMeters)}
          </Text>
        </View>
        {active && (
          <View
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              backgroundColor: palette.aegean,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Text style={{ ...KICKER, color: palette.white }}>You are here</Text>
          </View>
        )}
      </View>
      <View
        style={{
          padding: 16,
          flexDirection: "row",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <Text style={{ ...KICKER, color: palette.inkSoft, paddingTop: 4 }}>
          {last ? "Arrive" : "Then"}
        </Text>
        <Text
          style={{
            flex: 1,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 17,
            lineHeight: 22,
            color: done ? palette.inkSoft : palette.ink,
          }}
        >
          {step.instruction}
        </Text>
      </View>
    </Pressable>
  );
}

// Simple maneuver glyphs — used only when Street View has no coverage.
function ManeuverFallback({ maneuver }: { maneuver: string }) {
  const arrow = maneuver.includes("left")
    ? "M 40 20 L 20 40 L 40 60 M 20 40 L 80 40"
    : maneuver.includes("right")
      ? "M 60 20 L 80 40 L 60 60 M 80 40 L 20 40"
      : "M 50 15 L 50 65 M 50 15 L 35 30 M 50 15 L 65 30";
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={96} height={80} viewBox="0 0 100 80">
        <Path
          d={arrow}
          stroke={palette.aegeanDeep}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
