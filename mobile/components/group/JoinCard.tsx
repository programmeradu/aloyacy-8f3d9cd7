// Join flow — display name, location permission, and first ping.

import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Share, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette } from "@/constants/theme";
import { NAME_KEY, TOKEN_KEY, callGroups } from "./kit";

export function JoinCard({ code, onJoined }: { code: string; onJoined: (t: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(NAME_KEY).then((s) => {
      if (s) setName(s);
    });
  }, []);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Add your name", "Others in the group will see how they know you.");
      return;
    }
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Ask for location up front so we can send it on join
      let origin: { lat: number; lng: number } | undefined;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          origin = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      } catch {
        // location is optional at join — the ping loop will retry once granted
      }

      const res = await callGroups<{ memberToken: string }>("join", {
        code,
        displayName: trimmed,
        origin,
      });
      if (!res?.memberToken) {
        Alert.alert("Couldn't join", "The group may have ended or the code is wrong.");
        return;
      }
      await AsyncStorage.setItem(TOKEN_KEY(code), res.memberToken);
      await AsyncStorage.setItem(NAME_KEY, trimmed);
      onJoined(res.memberToken);
    } finally {
      setBusy(false);
    }
  }, [name, code, onJoined]);

  return (
    <View
      style={{
        backgroundColor: palette.ink,
        borderRadius: 24,
        padding: 20,
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.ochre,
        }}
      >
        Join this trip
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 22,
          lineHeight: 26,
          color: palette.white,
        }}
      >
        Share your ETA with the group
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.7)" }}>
        Your live position stays visible only to people in this group and only while the trip is active.
      </Text>

      <View style={{ marginTop: 16 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          How you'll appear
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={{
            marginTop: 8,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            fontFamily: "Geist_600SemiBold",
            fontSize: 15,
            color: palette.white,
          }}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => ({
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: "center",
          backgroundColor: busy ? "rgba(201,133,58,0.6)" : palette.ochre,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, letterSpacing: 0.4, color: palette.ink }}>
          {busy ? "Joining…" : "Join the group"}
        </Text>
      </Pressable>
    </View>
  );
}

/* ——————————————————————————— Live card (already joined) ——————————————————————————— */
