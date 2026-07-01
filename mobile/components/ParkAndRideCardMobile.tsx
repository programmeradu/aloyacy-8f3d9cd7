// Mobile Park & Ride card — surfaced above the bus-only itinerary list
// when driving to a hub + bus genuinely beats the bus-only plan.
import { View, Text, Pressable, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import type { ParkAndRideSuggestion } from "@/lib/pnr";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}
function fmtKm(m: number): string {
  return (m / 1000).toFixed(m >= 10_000 ? 0 : 1);
}

export function ParkAndRideCardMobile({
  suggestion,
  origin,
}: {
  suggestion: ParkAndRideSuggestion;
  origin: { lat: number; lng: number };
}) {
  const driveMin = fmtMin(suggestion.driveSec);
  const busMin = fmtMin(suggestion.bus.durationSec);
  const totalMin = fmtMin(suggestion.totalSec);
  const driveKm = fmtKm(suggestion.driveMeters);

  const eyebrow =
    suggestion.reason === "faster"
      ? `${fmtMin(suggestion.savingsSec)} min faster`
      : suggestion.reason === "comfort"
        ? "Skip the long walk"
        : suggestion.reason === "traffic-jam"
          ? `Beats traffic by ${fmtMin(suggestion.savingsSec)} min`
          : "Only honest option";

  const mapsHref = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${suggestion.hub.lat},${suggestion.hub.lng}&travelmode=driving`;

  const lt = suggestion.liveTraffic;
  const showWhy = lt?.notable === true;
  const trafficDelayMin = lt ? fmtMin(lt.delaySec) : 0;
  const trafficPct = lt ? Math.round(lt.severity * 100) : 0;
  const directDriveMin = lt ? fmtMin(lt.directDriveSec) : 0;

  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 18,
        gap: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.aegeanDeep,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            flex: 1,
          }}
          numberOfLines={1}
        >
          {eyebrow}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.inkSoft,
            letterSpacing: 0.4,
          }}
        >
          {totalMin} MIN TOTAL
        </Text>
      </View>

      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 20,
          lineHeight: 24,
          color: palette.ink,
          letterSpacing: -0.4,
        }}
      >
        Park near {suggestion.hub.label}, then catch the bus
      </Text>

      {showWhy && (
        <View
          style={{
            backgroundColor: palette.ochreSoft,
            borderRadius: 16,
            padding: 12,
            gap: 4,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              color: palette.ochre,
              letterSpacing: 0.5,
            }}
          >
            WHY NOW
          </Text>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            Direct drive is {trafficDelayMin} min slower than usual right now
            ({trafficPct}% over free-flow, {directDriveMin} min total).
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Stat
          eyebrow="DRIVE"
          value={driveMin}
          unit="min"
          sub={`${driveKm} km`}
          tone="ink"
        />
        <Stat
          eyebrow="BUS"
          value={busMin}
          unit="min"
          sub={
            suggestion.bus.firstRoute
              ? `${suggestion.bus.firstRoute} from ${suggestion.bus.boardName}`
              : suggestion.bus.boardName
          }
          tone="aegean"
        />
      </View>

      {suggestion.hub.note ? (
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {suggestion.hub.note}
        </Text>
      ) : null}

      {suggestion.hub.ev ? <EvBlock ev={suggestion.hub.ev} /> : null}



      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          Linking.openURL(mapsHref).catch(() => {});
        }}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          backgroundColor: palette.ink,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 10,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            color: palette.white,
            fontSize: 13,
            letterSpacing: 0.3,
          }}
        >
          Open driving directions
        </Text>
      </Pressable>
    </View>
  );
}

function Stat({
  eyebrow,
  value,
  unit,
  sub,
  tone,
}: {
  eyebrow: string;
  value: number;
  unit: string;
  sub: string;
  tone: "ink" | "aegean";
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor:
          tone === "aegean" ? palette.aegeanSoft : palette.limestoneSoft,
        borderRadius: 16,
        padding: 12,
        gap: 4,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          color: tone === "aegean" ? palette.aegeanDeep : palette.inkSoft,
          letterSpacing: 0.5,
        }}
      >
        {eyebrow}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 26,
            color: palette.ink,
            lineHeight: 28,
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            color: palette.inkSoft,
          }}
        >
          {unit}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          color: palette.inkSoft,
          letterSpacing: 0.3,
        }}
        numberOfLines={1}
      >
        {sub}
      </Text>
    </View>
  );
}
