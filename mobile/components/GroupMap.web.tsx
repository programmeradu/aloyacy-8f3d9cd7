// Web fallback for the group map — the react-native-maps import path is
// native-only. On web we render a lightweight static preview instead.
import { View, Text } from "react-native";
import { palette } from "@/constants/theme";

export type GroupMapMember = {
  id: string;
  displayName: string;
  lat: number | null;
  lng: number | null;
  lastUpdated: string | null;
  isMe: boolean;
  isCreator: boolean;
};

export function GroupMap({
  destinationLabel,
  height = 260,
  members,
}: {
  members: GroupMapMember[];
  destination: { lat: number; lng: number };
  destinationLabel: string;
  height?: number;
}) {
  const live = members.filter((m) => m.lat != null).length;
  return (
    <View
      style={{
        height,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.limestoneSoft,
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
      >
        Live map · {live} sharing
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "Geist_600SemiBold",
          fontSize: 13,
          color: palette.ink,
          textAlign: "center",
        }}
        numberOfLines={2}
      >
        Everyone converging on {destinationLabel}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: "Geist_500Medium",
          fontSize: 11,
          color: palette.inkSoft,
          textAlign: "center",
        }}
      >
        Open the mobile app for the live map view.
      </Text>
    </View>
  );
}

export default GroupMap;
