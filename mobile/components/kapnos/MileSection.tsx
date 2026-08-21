// First-/last-mile bus plan attached to a coach leg: shown when the coach
// stop is beyond a reasonable walk from the rider's actual origin or
// destination.

import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { fmtMin, fmtWalk, shortStop } from "@/lib/kapnos-format";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/journey-types";

export function MileSection({
  title,
  itinerary,
  loading,
  onStart,
  emptyCopy,
}: {
  title: string;
  itinerary: Itinerary | null;
  loading: boolean;
  onStart?: () => void;
  emptyCopy: string;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 12,
        gap: 8,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          color: palette.ink,
          letterSpacing: 1.2,
        }}
      >
        {title}
      </Text>
      {loading ? (
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.inkSoft,
            letterSpacing: 0.6,
          }}
        >
          PLANNING BUS ROUTE…
        </Text>
      ) : itinerary ? (
        <Pressable
          onPress={() => {
            if (!onStart) return;
            Haptics.selectionAsync().catch(() => {});
            onStart();
          }}
          disabled={!onStart}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, gap: 4 })}
        >
          <MiniItinerary itinerary={itinerary} />
          {onStart && (
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                color: palette.aegeanDeep,
                letterSpacing: 1.2,
                marginTop: 4,
              }}
            >
              TAP TO START THIS BUS →
            </Text>
          )}
        </Pressable>
      ) : (
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            color: palette.inkSoft,
            lineHeight: 17,
          }}
        >
          {emptyCopy}
        </Text>
      )}
    </View>
  );
}

function MiniItinerary({ itinerary }: { itinerary: Itinerary }) {
  const rides = itinerary.legs.filter((l): l is RideLeg => l.kind === "ride");
  const totalMin = fmtMin(itinerary.totalDurationSec);
  const walkM = Math.round(itinerary.totalWalkMeters);
  // A pure-walk plan has no ride to name, so fall back to the walk endpoints.
  const from = rides[0]
    ? shortStop(rides[0].board.name)
    : (() => {
        const w = itinerary.legs.find((l): l is WalkLeg => l.kind === "walk");
        return w ? shortStop(w.from.name) : "";
      })();
  const to = rides[rides.length - 1]
    ? shortStop(rides[rides.length - 1]!.alight.name)
    : (() => {
        const walks = itinerary.legs.filter((l): l is WalkLeg => l.kind === "walk");
        const last = walks[walks.length - 1];
        return last ? shortStop(last.to.name) : "";
      })();

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
        {rides.map((r, i) => (
          <Text
            key={`${r.tripId}-${i}`}
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              color: palette.aegeanDeep,
              letterSpacing: 0.8,
            }}
          >
            {r.routeShort}
            {i < rides.length - 1 ? "  →  " : ""}
          </Text>
        ))}
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.inkSoft,
            letterSpacing: 0.6,
          }}
        >
          · {totalMin} MIN · {fmtWalk(walkM)}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          color: palette.inkSoft,
          lineHeight: 17,
        }}
      >
        {from} → {to}
      </Text>
    </View>
  );
}
