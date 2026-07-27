// Shared chrome for the airport screen: top bar, title block, ghost-feed
// notice, section heading, empty state and the unknown-airport fallback.

import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { palette } from "@/constants/theme";

export function AirportTopBar({
  iata,
  onBack,
  onShare,
}: {
  iata: string;
  onBack: () => void;
  onShare: () => void;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 18,
      }}
    >
      <RoundButton label="←" accessibilityLabel="Go back" onPress={onBack} nudge={-2} />
      <Text
        style={{
          flex: 1,
          textAlign: "center",
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 2.2,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
        numberOfLines={1}
      >
        Airport {iata}
      </Text>
      <RoundButton label="↗" accessibilityLabel="Share this airport" onPress={onShare} />
    </View>
  );
}

function RoundButton({
  label,
  accessibilityLabel,
  onPress,
  nudge = 0,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  nudge?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_600SemiBold",
          fontSize: 15,
          color: palette.ink,
          marginTop: nudge,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AirportTitle({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: name.length > 22 ? 30 : 38,
          lineHeight: name.length > 22 ? 34 : 42,
          letterSpacing: -1,
          color: palette.ink,
        }}
      >
        {name}
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          color: palette.inkSoft,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

export function GhostFeedNotice() {
  return (
    <View
      style={{
        marginTop: 16,
        marginHorizontal: 20,
        borderRadius: 20,
        backgroundColor: palette.ochreSoft,
        borderWidth: 1,
        borderColor: "rgba(201,133,58,0.35)",
        paddingHorizontal: 18,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: palette.ink,
        }}
      >
        Bus missing from feed
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        The operator stopped reporting this bus. Showing the scheduled time.
      </Text>
    </View>
  );
}

export function BoardHeading({ status, stale }: { status: string; stale: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 24,
        marginTop: 30,
        marginBottom: 14,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 9.5,
            letterSpacing: 2.4,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Live · Smart ETA
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 24,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          Next departures
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 1.8,
          color: stale ? palette.ochre : palette.aegeanDeep,
          textTransform: "uppercase",
          paddingBottom: 2,
          textAlign: "right",
        }}
      >
        {status}
      </Text>
    </View>
  );
}

export function AirportNotice({ children }: { children: string }) {
  return (
    <View
      style={{
        marginTop: 16,
        marginHorizontal: 20,
        padding: 14,
        borderRadius: 16,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export function AirportEmptyState() {
  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 22,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 22,
      }}
    >
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 17,
          color: palette.ink,
        }}
      >
        Nothing upcoming
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        Coaches and local buses will appear here as they're scheduled.
      </Text>
    </View>
  );
}

export function UnknownAirport({ code, topInset }: { code: string; topInset: number }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{ paddingTop: topInset + 40, paddingHorizontal: 24, paddingBottom: 48 }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 2.4,
          color: palette.aegeanDeep,
          textTransform: "uppercase",
        }}
      >
        Not in Cyprus
      </Text>
      <Text
        style={{
          marginTop: 12,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 30,
          lineHeight: 34,
          letterSpacing: -0.8,
          color: palette.ink,
        }}
      >
        No airport page for “{code || "—"}”.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace("/airport/lca")}
        style={({ pressed }) => ({
          marginTop: 20,
          alignSelf: "flex-start",
          backgroundColor: palette.ink,
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 18,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text
          style={{ fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.limestone }}
        >
          Larnaca (LCA)
        </Text>
      </Pressable>
    </ScrollView>
  );
}
