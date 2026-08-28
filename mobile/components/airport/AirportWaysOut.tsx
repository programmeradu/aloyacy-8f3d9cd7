// How to leave — stacked sentences, not three equal cards.
// Same numbers as web: Kapnos seats/price, urban Motion fare, taxi unquoted.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import { airportWayRows, type AirportJob } from "@aloya/core/airport-job";

export function AirportWaysOut({ job, status }: { job: AirportJob; status: string }) {
  const rows = airportWayRows(job);
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 30, marginBottom: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 24,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          How to leave
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 1.8,
            color: palette.aegeanDeep,
            textTransform: "uppercase",
            paddingBottom: 2,
            textAlign: "right",
          }}
        >
          {status}
        </Text>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: palette.line,
        }}
      >
        {rows.map((row, i) => (
          <Text
            key={row.key}
            style={{
              paddingVertical: 12,
              fontFamily: "Geist_500Medium",
              fontSize: 15,
              lineHeight: 21,
              color: palette.ink,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: palette.line,
            }}
          >
            {row.line}
          </Text>
        ))}
      </View>
    </View>
  );
}
