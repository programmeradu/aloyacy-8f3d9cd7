import type { ReactNode } from "react";
import { View, Text, Pressable, Linking, Image } from "react-native";
import { palette } from "@/constants/theme";
import { Card } from "./Card";
import { formatDistance } from "@/lib/format";
import { assets } from "@/lib/assets";
import type {
  BikeShareSuggestion,
  BoltScooterSuggestion,
  LastMileChainSuggestion,
} from "@/lib/wave3";

// ── Operator logo header ──────────────────────────────────────────────────
function OperatorHeader({
  source,
  name,
  eyebrow,
  logoWidth = 68,
  logoHeight = 20,
}: {
  source: { uri: string };
  name: string;
  eyebrow: string;
  logoWidth?: number;
  logoHeight?: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Image
          source={source}
          accessibilityLabel={`${name} logo`}
          style={{ width: logoWidth, height: logoHeight }}
          resizeMode="contain"
        />
        <View
          style={{
            width: 1,
            height: 14,
            backgroundColor: palette.line,
          }}
        />
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 1.4,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Text>
      </View>
    </View>
  );
}


// ── Shared atoms ──────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: ReactNode }) {
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

function CtaButton({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: primary ? palette.ink : palette.limestoneSoft,
        borderWidth: primary ? 0 : 1,
        borderColor: palette.line,
        alignItems: "center",
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          color: primary ? palette.white : palette.ink,
          fontSize: 13,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Eyebrow>{label}</Eyebrow>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 24,
          color: palette.ink,
          marginTop: 4,
          letterSpacing: -0.6,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function fmtMin(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
}

// ── Bike share ────────────────────────────────────────────────────────────
export function BikeShareCardMobile({ s }: { s: BikeShareSuggestion }) {
  const headline =
    s.reason === "faster"
      ? `Save ${fmtMin(s.savingsSec)} on a Nextbike`
      : "Cycle there with Nextbike";
  return (
    <Card style={{ padding: 20 }}>
      <OperatorHeader
        source={assets.nextbike_logo}
        name="Nextbike"
        eyebrow={`Bike share · ${s.cityName}`}
      />
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          color: palette.ink,
          marginTop: 6,
          letterSpacing: -0.5,
          lineHeight: 26,
        }}
      >
        {headline}
      </Text>
      <View style={{ flexDirection: "row", marginTop: 16, gap: 14 }}>
        <Stat label="RIDE" value={fmtMin(s.rideSec)} />
        <Stat label="DOOR TO DOOR" value={fmtMin(s.totalSec)} />
        <Stat label="DISTANCE" value={formatDistance(s.rideMeters)} />
      </View>

      <View
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: palette.line,
          gap: 10,
        }}
      >
        <View>
          <Eyebrow>01 · PICKUP</Eyebrow>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              color: palette.ink,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {s.pickup.name}
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              color: palette.inkSoft,
              marginTop: 2,
            }}
          >
            {s.pickup.bikes} bikes · {formatDistance(s.pickup.distanceM)} walk
          </Text>
        </View>
        <View>
          <Eyebrow>02 · DROPOFF</Eyebrow>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              color: palette.ink,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {s.dropoff.name}
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              color: palette.inkSoft,
              marginTop: 2,
            }}
          >
            {s.dropoff.freeRacks} free racks · {formatDistance(s.dropoff.distanceM)} walk
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <CtaButton label="Open Nextbike" onPress={() => Linking.openURL(s.webDeepLink)} primary />
        <CtaButton label="Cycle route" onPress={() => Linking.openURL(s.mapsDeepLink)} />
      </View>
    </Card>
  );
}

// ── Bolt scooter ──────────────────────────────────────────────────────────
export function BoltScooterCardMobile({ s }: { s: BoltScooterSuggestion }) {
  const headline =
    s.reason === "faster"
      ? `Save ${fmtMin(s.savingsSec)} on a Bolt scooter`
      : "Bolt scooter is legal here";
  return (
    <Card style={{ padding: 20 }}>
      <Eyebrow>E-SCOOTER · NICOSIA</Eyebrow>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          color: palette.ink,
          marginTop: 6,
          letterSpacing: -0.5,
          lineHeight: 26,
        }}
      >
        {headline}
      </Text>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          color: palette.inkSoft,
          marginTop: 6,
          lineHeight: 18,
        }}
      >
        Check the Bolt app for a live scooter before walking — we don&apos;t
        track inventory.
      </Text>

      <View style={{ flexDirection: "row", marginTop: 16, gap: 14 }}>
        <Stat label="RIDE" value={fmtMin(s.rideSec)} />
        <Stat label="DOOR TO DOOR" value={fmtMin(s.totalSec)} />
        <Stat label="DISTANCE" value={formatDistance(s.rideMeters)} />
      </View>

      <View
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: palette.line,
          gap: 10,
        }}
      >
        <View>
          <Eyebrow>01 · START ZONE</Eyebrow>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              color: palette.ink,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {s.pickup.name}
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              color: palette.inkSoft,
              marginTop: 2,
            }}
          >
            {formatDistance(s.pickup.distanceM)} walk · {s.pickup.capacity} slots
          </Text>
        </View>
        <View>
          <Eyebrow>02 · PARK ZONE</Eyebrow>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              color: palette.ink,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {s.dropoff.name}
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              color: palette.inkSoft,
              marginTop: 2,
            }}
          >
            {formatDistance(s.dropoff.distanceM)} walk · {s.dropoff.capacity} slots
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <CtaButton label="Open Bolt" onPress={() => Linking.openURL(s.appDeepLink)} primary />
        <CtaButton label="Cycle route" onPress={() => Linking.openURL(s.mapsDeepLink)} />
      </View>
    </Card>
  );
}

// ── Last-mile chain ───────────────────────────────────────────────────────
const TRIGGER_HEADLINE: Record<LastMileChainSuggestion["trigger"], string> = {
  "long-walk": "Long walk at the end — take a taxi",
  "late-night": "Late arrival — taxi the last bit",
  "long-late": "Long, late walk — call a taxi",
};

export function LastMileChainCardMobile({ s }: { s: LastMileChainSuggestion }) {
  const fare = `€${s.fareLow.toFixed(2)}–€${s.fareHigh.toFixed(2)}`;
  return (
    <Card style={{ padding: 20 }}>
      <Eyebrow>{s.isNightRate ? "TAXI · NIGHT RATE" : "TAXI HANDOFF"}</Eyebrow>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          color: palette.ink,
          marginTop: 6,
          letterSpacing: -0.5,
          lineHeight: 26,
        }}
      >
        {TRIGGER_HEADLINE[s.trigger]}
      </Text>

      <View style={{ flexDirection: "row", marginTop: 16, gap: 14 }}>
        <Stat label="DRIVE" value={fmtMin(s.drivingSec)} />
        <Stat label="vs WALK" value={fmtMin(s.walkSec)} />
        <Stat label="FARE" value={fare} />
      </View>

      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          color: palette.inkSoft,
          marginTop: 12,
          lineHeight: 18,
        }}
      >
        From {s.fromName} to {s.toName} · {formatDistance(s.distanceMeters)} drive
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <CtaButton label="Open Bolt" onPress={() => Linking.openURL(s.boltDeepLink)} primary />
        <CtaButton label="Call taxi" onPress={() => Linking.openURL(`tel:${s.telDispatcher}`)} />
      </View>
      <Pressable
        onPress={() => Linking.openURL(s.mapsDeepLink)}
        style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.6 : 1 })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            color: palette.aegeanDeep,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Open in Maps instead
        </Text>
      </Pressable>
    </Card>
  );
}
