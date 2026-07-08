// Leg timeline row and the small banner card used above the hero.

import type React from "react";
import { Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { RouteChip } from "@/components/RouteChip";
import type { Leg, WalkLeg, WaitLeg } from "@/lib/journey-types";
import { KICKER, fmtClock, fmtMin } from "./kit";

// ---------------------------------------------------------------------------
// Timeline row
// ---------------------------------------------------------------------------
export function LegTimelineRow({
  leg,
  isActive,
  isDone,
}: {
  leg: Leg;
  isActive: boolean;
  isDone: boolean;
}) {
  const dotBg = isDone
    ? "rgba(63,74,54,0.10)"
    : isActive
      ? palette.aegeanDeep
      : palette.limestoneSoft;
  const dotColor = isDone
    ? palette.olive
    : isActive
      ? palette.white
      : palette.inkSoft;
  const glyph =
    leg.kind === "ride" ? "◇" : leg.kind === "walk" ? "→" : "…";
  let title: React.ReactNode;
  let sub: string;
  let accent: React.ReactNode = null;
  if (leg.kind === "ride") {
    title = (
      <Text>
        Board{" "}
        <Text style={{ color: palette.aegeanDeep }}>bus {leg.routeShort}</Text>{" "}
        — {leg.routeLong}
      </Text>
    );
    sub = `${leg.board.name} → ${leg.alight.name} · ${fmtClock(leg.board.departureUnix)}–${fmtClock(leg.alight.arrivalUnix)} · ${leg.stopCount} stops`;
    accent = <RouteChip short={leg.routeShort} />;
  } else if (leg.kind === "walk") {
    const w = leg as WalkLeg;
    title = <Text>Walk to {w.to.name}</Text>;
    sub = `${fmtMin(w.durationSec)} min · ${Math.round(w.distanceMeters)} m`;
  } else {
    const w = leg as WaitLeg;
    title = <Text>Wait at {w.name}</Text>;
    sub = `${fmtMin(w.durationSec)} min for the next bus`;
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: dotBg,
          borderWidth: 1,
          borderColor: isActive ? palette.aegeanDeep : palette.line,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 13,
            color: dotColor,
          }}
        >
          {glyph}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 17,
            lineHeight: 21,
            letterSpacing: -0.3,
            color: isActive ? palette.ink : palette.inkSoft,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            lineHeight: 17,
            color: palette.inkSoft,
          }}
        >
          {sub}
        </Text>
      </View>
      {accent}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
export function BannerCard({
  tone,
  title,
  body,
}: {
  tone: "aegean" | "ochre" | "ink";
  title: string;
  body: string;
}) {
  const bg =
    tone === "aegean"
      ? palette.aegeanSoft
      : tone === "ochre"
        ? palette.ochreSoft
        : palette.white;
  const border =
    tone === "aegean"
      ? "rgba(63,155,178,0.30)"
      : tone === "ochre"
        ? "rgba(201,133,58,0.40)"
        : palette.line;
  const kickerColor =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
        ? palette.ochre
        : palette.ink;
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <View
        style={{
          borderRadius: 22,
          padding: 16,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        <Text style={{ ...KICKER, color: kickerColor }}>{title}</Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.ink,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
