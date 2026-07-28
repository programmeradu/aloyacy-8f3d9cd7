// Ordered stop sequence for the line, with the live bus dot on the stop it is
// standing at (or approaching).

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { stopRowLabel, type BoardStop, type RouteBoard } from "@aloya/core/route-board";

import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { MONO_KICKER, SectionHeader } from "./RouteChrome";

export function RouteStopsList({
  board,
  stopOf,
}: {
  board: RouteBoard;
  stopOf: (id: string) => BoardStop | undefined;
}) {
  const total = board.stopIds.length;
  if (total === 0) return null;

  return (
    <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
      <SectionHeader title="Stops on this line" kicker={`${total} STOPS`} />
      <Card style={{ overflow: "hidden", padding: 0 }}>
        {board.stopIds.map((id, i) => {
          const s = stopOf(id);
          if (!s) return null;
          const isEdge = i === 0 || i === total - 1;
          const { label, live } = stopRowLabel({
            index: i,
            total,
            code: s.code,
            buses: board.busesOnLine,
          });

          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}. ${label}`}
              onPress={() => {
                void Haptics.selectionAsync();
                router.push(`/stop/${id}`);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: i === total - 1 ? 0 : 1,
                borderBottomColor: palette.line,
                backgroundColor: pressed
                  ? palette.limestoneSoft
                  : live
                    ? "rgba(201,133,58,0.06)"
                    : "transparent",
              })}
            >
              <View style={{ width: 16, alignItems: "center" }}>
                <View
                  style={{
                    width: live ? 12 : 9,
                    height: live ? 12 : 9,
                    borderRadius: 999,
                    backgroundColor: live
                      ? palette.ochre
                      : isEdge
                        ? palette.ochre
                        : palette.aegeanDeep,
                    borderWidth: live ? 2 : 0,
                    borderColor: palette.limestone,
                  }}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 15,
                    color: palette.ink,
                  }}
                >
                  {s.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    MONO_KICKER,
                    {
                      marginTop: 3,
                      fontSize: 9,
                      letterSpacing: 1.6,
                      color: live ? palette.ochre : palette.inkSoft,
                    },
                  ]}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}
