// Cards on the shared-plan screen: the sender's note, the leave/arrive
// summary, the step-by-step itinerary, the meeting point, the CTAs, and
// the link-expiry line.

import { useCallback, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import {
  planClock as fmtTime,
  planDate as fmtDate,
  planDuration as fmtDur,
  changesLabel,
  legCopy,
  meetPoint,
  expiryLabel,
  type PlanShare,
  type PlanShareLeg as Leg,
} from "@aloya/core/plan-share";

function NoteCard({ name, note }: { name: string; note: string }) {
  return (
    <View
      style={{
        backgroundColor: palette.ochreSoft,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(201,133,58,0.35)",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.ink,
        }}
      >
        {name} says
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 18,
          lineHeight: 24,
          color: palette.ink,
        }}
      >
        {note}
      </Text>
    </View>
  );
}

export function SummaryCard({ plan }: { plan: PlanShare }) {
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        {fmtDate(plan.departure_unix)}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 10, gap: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "JetBrainsMono_500Medium", fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: palette.inkSoft }}>
            Leave
          </Text>
          <Text style={{ marginTop: 4, fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 28, lineHeight: 32, color: palette.ink }}>
            {fmtTime(plan.departure_unix)}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "JetBrainsMono_500Medium", fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: palette.inkSoft }}>
            Arrive
          </Text>
          <Text style={{ marginTop: 4, fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 28, lineHeight: 32, color: palette.ink }}>
            {fmtTime(plan.arrival_unix)}
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTopWidth: 1,
          borderColor: palette.line,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.inkSoft }}>
          {fmtDur(plan.total_duration_sec)} in transit
        </Text>
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.inkSoft }}>
          {changesLabel(plan.transfers)}
        </Text>
      </View>
    </View>
  );
}

export function ItineraryCard({ plan }: { plan: PlanShare }) {
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: palette.line }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          Step by step
        </Text>
      </View>
      {plan.legs.map((leg, i) => (
        <LegRow key={i} leg={leg} last={i === plan.legs.length - 1} />
      ))}
    </View>
  );
}

export function LegRow({ leg, last }: { leg: Leg; last: boolean }) {
  const copy = legCopy(leg);
  const isRide = copy.kind === "ride";
  const isWalk = copy.kind === "walk";

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 14,
        padding: 16,
        borderTopWidth: last ? 0 : 0,
        borderBottomWidth: last ? 0 : 1,
        borderColor: palette.line,
      }}
    >
      <View style={{ width: 46, alignItems: "center" }}>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: isRide ? palette.ink : isWalk ? palette.aegeanSoft : palette.limestoneSoft,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              letterSpacing: 0.6,
              color: isRide ? palette.white : palette.ink,
            }}
          >
            {copy.badge}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, lineHeight: 20, color: palette.ink }} numberOfLines={2}>
          {copy.title}
        </Text>
        {copy.subtitle ? (
          <Text style={{ marginTop: 2, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 18, color: palette.inkSoft }} numberOfLines={2}>
            {copy.subtitle}
          </Text>
        ) : null}
        <Text style={{ marginTop: 6, fontFamily: "JetBrainsMono_500Medium", fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: palette.inkSoft }}>
          {copy.timing}
        </Text>
      </View>
    </View>
  );
}

export function MeetCard({ plan }: { plan: PlanShare }) {
  const { name: meetName, unix: meetTime } = meetPoint(plan);
  return (
    <View
      style={{
        backgroundColor: palette.aegeanSoft,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: "rgba(31,108,130,0.15)",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        Meet at
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          lineHeight: 26,
          color: palette.ink,
        }}
      >
        {meetName}
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.ink }}>
        Bus leaves {fmtTime(meetTime)}. Aim to be there five minutes earlier.
      </Text>
    </View>
  );
}

export function CTAStack({ plan, onShare }: { plan: PlanShare; onShare: () => void }) {
  const openInApp = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/(tabs)/plan",
      params: {
        fromLabel: plan.origin_label,
        fromLat: String(plan.origin_lat),
        fromLng: String(plan.origin_lng),
        toLabel: plan.destination_label,
        toLat: String(plan.destination_lat),
        toLng: String(plan.destination_lng),
      },
    });
  }, [plan]);

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={openInApp}
        style={({ pressed }) => ({
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: palette.ink,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.white }}>
          Open this plan in Aloya
        </Text>
      </Pressable>
      <Pressable
        onPress={onShare}
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.ink }}>
          Share this link
        </Text>
      </Pressable>
    </View>
  );
}

export function ExpiryLine({ expiresAt }: { expiresAt: string }) {
  const label = useMemo(() => expiryLabel(expiresAt), [expiresAt]);
  return (
    <Text style={{ marginTop: 4, fontFamily: "Geist_500Medium", fontSize: 11, textAlign: "center", color: palette.inkSoft }}>
      {label}
    </Text>
  );
}
