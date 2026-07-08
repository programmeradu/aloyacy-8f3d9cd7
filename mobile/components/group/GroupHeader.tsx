// Group hero, back/code chips and the identity ribbon above the member list.

import { Image, Pressable, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { HERO, type GroupRow, type MemberRow } from "./kit";

export function Hero({ group, expired, isLoading }: { group: GroupRow | null; expired: boolean; isLoading: boolean }) {
  return (
    <View style={{ height: 340, position: "relative", backgroundColor: palette.limestoneSoft }}>
      <Image source={{ uri: HERO }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.9 }} resizeMode="cover" />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 260,
          backgroundColor: "transparent",
        }}
      >
        {/* Layered gradient fake — matches web from-limestone/10 → limestone */}
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(246,241,231,0.15)" }} />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200, backgroundColor: palette.limestone, opacity: 0.75 }} />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90, backgroundColor: palette.limestone }} />
      </View>

      <View style={{ position: "absolute", left: 20, right: 20, bottom: 22 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          Everyone converging on
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 34,
            lineHeight: 38,
            letterSpacing: -0.8,
            color: palette.ink,
          }}
          numberOfLines={3}
        >
          {isLoading ? "Loading trip…" : group?.destination_label ?? "Group trip"}
        </Text>
      </View>
    </View>
  );
}

export function BackChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(246,241,231,0.92)",
        borderWidth: 1,
        borderColor: palette.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: "Geist_700Bold", fontSize: 12, color: palette.ink }}>‹ Back</Text>
    </Pressable>
  );
}

export function CodeChip({ code, expired }: { code: string; expired: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(246,241,231,0.92)",
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      {!expired && <PulseDot />}
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          color: palette.ink,
        }}
      >
        {expired ? "Ended" : `Live · ${code}`}
      </Text>
    </View>
  );
}

export function PulseDot() {
  return <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: palette.aegeanDeep }} />;
}

/* ——————————————————————————— Identity ribbon ——————————————————————————— */

export function IdentityRibbon({
  me,
  hasToken,
  expired,
  hostName,
}: {
  me: MemberRow | null;
  hasToken: boolean;
  expired: boolean;
  hostName: string | null;
}) {
  let body: string;
  if (expired) body = "This group has ended. History stays visible below.";
  else if (me?.is_creator) body = `You appear as ${me.display_name}. You started this group.`;
  else if (me) body = `You appear as ${me.display_name}. Your live position is visible to the group.`;
  else if (hasToken) body = "Rejoining — one moment.";
  else body = hostName ? `${hostName} started this trip. Join to share your ETA.` : "Join the trip to share your live ETA.";

  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 16,
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        You in this group
      </Text>
      <Text style={{ marginTop: 6, fontFamily: "Geist_600SemiBold", fontSize: 14, lineHeight: 20, color: palette.ink }}>
        {body}
      </Text>
    </View>
  );
}

/* ——————————————————————————— Converge card ——————————————————————————— */
