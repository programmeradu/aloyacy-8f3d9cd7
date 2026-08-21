import { Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { fmtWalk, shortStop } from "@/lib/kapnos-format";

/** One end of the coach ride: the stop name plus the walk it costs. */
export function Endpoint({
  label,
  name,
  distance,
}: {
  label: string;
  name: string;
  distance: number;
}) {
  return (
    <View>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          color: palette.inkSoft,
          letterSpacing: 0.4,
        }}
      >
        {label.toUpperCase()} · {fmtWalk(distance)} WALK
      </Text>
      <Text
        style={{
          fontFamily: "Geist_600SemiBold",
          fontSize: 14,
          color: palette.ink,
          marginTop: 1,
        }}
        numberOfLines={1}
      >
        {shortStop(name)}
      </Text>
    </View>
  );
}
