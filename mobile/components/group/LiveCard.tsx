// Live sharing card — invite, copy code, and leaving the group.

import { useCallback, useState } from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { callGroups, type GroupRow, type MemberRow } from "./kit";

export function LiveCard({
  group,
  me,
  memberToken,
  onLeft,
  onEnded,
}: {
  group: GroupRow;
  me: MemberRow;
  memberToken: string;
  onLeft: () => Promise<void>;
  onEnded: () => Promise<void>;
}) {
  void me;
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);

  const share = useCallback(async () => {
    void Haptics.selectionAsync();
    const url = `https://app.aloya.cy/group/${group.code}`;
    const message = `Join my trip to ${group.destination_label} on Aloya. Code ${group.code}\n${url}`;
    try {
      await Share.share({ message, url });
    } catch {
      await Clipboard.setStringAsync(url);
      Alert.alert("Link copied", url);
    }
  }, [group]);

  const leave = useCallback(() => {
    Alert.alert("Leave the group?", "Others will stop seeing your live position.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await callGroups("leave", { memberToken });
            await onLeft();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [memberToken, onLeft]);

  const endTrip = useCallback(() => {
    Alert.alert(
      "End this group trip?",
      "The group will be disbanded for everyone immediately. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End trip",
          style: "destructive",
          onPress: async () => {
            setEnding(true);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              await callGroups("end", { memberToken });
              await onEnded();
            } finally {
              setEnding(false);
            }
          },
        },
      ],
    );
  }, [memberToken, onEnded]);


  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: palette.line,
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
        You're live in this group
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_600SemiBold", fontSize: 14, lineHeight: 20, color: palette.ink }}>
        Your ETA updates every ~25 seconds while you're on the way.
      </Text>

      <Pressable
        onPress={share}
        style={({ pressed }) => ({
          marginTop: 16,
          paddingVertical: 14,
          borderRadius: 14,
          backgroundColor: palette.ink,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.white }}>
          Invite more people
        </Text>
      </Pressable>
      <Pressable
        onPress={leave}
        disabled={busy}
        style={({ pressed }) => ({
          marginTop: 10,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.inkSoft }}>
          {busy ? "Leaving…" : "Leave the group"}
        </Text>
      </Pressable>
      {me.is_creator && (
        <Pressable
          onPress={endTrip}
          disabled={ending}
          style={({ pressed }) => ({
            marginTop: 10,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: "rgba(184,52,52,0.08)",
            borderWidth: 1,
            borderColor: "rgba(184,52,52,0.35)",
            alignItems: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: "#8a2828" }}>
            {ending ? "Ending trip…" : "End group trip for everyone"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/* ——————————————————————————— Plan my route ——————————————————————————— */
