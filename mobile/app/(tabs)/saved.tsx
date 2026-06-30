import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 40,
      }}
    >
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 30,
          color: palette.ink,
          letterSpacing: -0.8,
        }}
      >
        Saved
      </Text>
      <Card style={{ marginTop: 24, padding: 24 }}>
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 16,
            color: palette.ink,
            marginBottom: 6,
          }}
        >
          Nothing saved yet
        </Text>
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 14,
            lineHeight: 20,
            color: palette.inkSoft,
          }}
        >
          Pin the stops you ride from most. They will appear here with live
          departures, ready to glance at.
        </Text>
      </Card>
    </ScrollView>
  );
}
