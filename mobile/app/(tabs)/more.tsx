import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { OfflineSchedulesCard } from "@/components/OfflineSchedulesCard";

const ROWS = [
  { label: "Language", value: "English" },
  { label: "Accessibility", value: "Off" },
  { label: "Notifications", value: "Off" },
  { label: "About Aloya", value: "v0.1" },
];

export default function MoreScreen() {
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
        More
      </Text>
      <Card style={{ marginTop: 22, paddingVertical: 4 }}>
        {ROWS.map((r, i) => (
          <View
            key={r.label}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 18,
              paddingVertical: 16,
              borderBottomWidth: i === ROWS.length - 1 ? 0 : 1,
              borderBottomColor: palette.line,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 15,
                color: palette.ink,
              }}
            >
              {r.label}
            </Text>
            <Text
              style={{
                fontFamily: "Geist_500Medium",
                fontSize: 14,
                color: palette.inkSoft,
              }}
            >
              {r.value}
            </Text>
          </View>
        ))}
      </Card>
      <OfflineSchedulesCard />
    </ScrollView>
  );
}
