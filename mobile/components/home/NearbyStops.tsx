// "Nearby stops" section: heading that states the location source in plain
// language, a shortcut into the planner, then the live stop cards with
// explicit loading and empty states.

import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { StopCard, type StopCardData } from "@/components/StopCard";

export function NearbyStops({
  stops,
  loading,
  locationStatus,
}: {
  stops: StopCardData[];
  loading: boolean;
  locationStatus: string;
}) {
  const kicker =
    locationStatus === "ready"
      ? "Around you"
      : locationStatus === "denied"
        ? "Location off"
        : "Live network";

  return (
    <>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>Nearby stops</Text>
        </View>
        <Pressable onPress={() => router.push("/plan")} hitSlop={10}>
          <Text style={styles.planLink}>Plan trip</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={palette.aegeanDeep} />
          </View>
        ) : stops.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No stops nearby</Text>
            <Text style={styles.emptyBody}>Move closer to a bus route to see live arrivals.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {stops.map((s) => (
              <StopCard key={s.id} stop={s} />
            ))}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    marginTop: 28,
    marginBottom: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 14,
  },
  kicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.9,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 3,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 28,
    color: palette.ink,
  },
  planLink: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.aegeanDeep,
  },
  emptyCard: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: palette.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
  },
  emptyTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 18,
    color: palette.ink,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkSoft,
    marginTop: 4,
    textAlign: "center",
  },
});
