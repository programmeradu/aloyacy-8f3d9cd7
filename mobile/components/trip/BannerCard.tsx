// Honest feed banner: ghost bus, stale feed, phone-tracked or untracked run.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import { KICKER } from "./kit";

export function BannerCard({
  tone,
  title,
  body,
}: {
  tone: "aegean" | "ochre" | "ink";
  title: string;
  body: string;
}) {
  const bg =
    tone === "aegean"
      ? palette.aegeanSoft
      : tone === "ochre"
        ? palette.ochreSoft
        : "rgba(31,30,24,0.06)";
  const kick =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
        ? palette.ochre
        : palette.ink;
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <View
        style={{
          borderRadius: 22,
          padding: 16,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: "rgba(31,30,24,0.08)",
        }}
      >
        <Text style={{ ...KICKER, color: kick }}>{title}</Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.ink,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
