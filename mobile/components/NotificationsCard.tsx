// Native NotificationsCard — semantic mirror of `src/components/NotificationsCard.tsx`.
//
// Differences vs web (necessary for native parity, not "lazy"):
//   - Permission + token flow goes through `registerForPushNotifications`
//     (Expo) instead of the browser PushManager.
//   - There is no "denied -> reopen prompt" affordance on RN: once the OS
//     denies, the user must visit Settings. We surface that honestly.
//   - The premium toggle, status chip, copy, and feature grid all mirror
//     the editorial direction (Bricolage + Geist + JetBrains Mono, ochre
//     /olive/aegean tones).

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { palette } from "@/constants/theme";
import { registerForPushNotifications } from "@/lib/push";

type Status = "unknown" | "unsupported" | "denied" | "off" | "on";

export function NotificationsCard() {
  const [status, setStatus] = useState<Status>("unknown");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const detect = useCallback(async () => {
    if (!Device.isDevice) {
      setStatus("unsupported");
      return;
    }
    const settings = await Notifications.getPermissionsAsync();
    if (settings.status === "denied") setStatus("denied");
    else if (settings.status === "granted") setStatus("on");
    else setStatus("off");
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  async function enable() {
    setPending(true);
    setMessage(null);
    const res = await registerForPushNotifications();
    setPending(false);
    if (res.ok) {
      setStatus("on");
      setMessage("Alerts enabled. We'll be quiet unless something matters.");
    } else if (res.reason === "denied") {
      setStatus("denied");
      setMessage("Permission denied. Re-enable from Settings.");
    } else if (res.reason === "unsupported") {
      setStatus("unsupported");
      setMessage("Push isn't available on this device.");
    } else {
      setMessage(res.message ?? "Couldn't enable alerts. Try again.");
    }
  }

  async function disable() {
    // RN can't programmatically revoke the OS permission. Surface honestly
    // and link to Settings so the rider can turn the channel off there.
    Alert.alert(
      "Turn alerts off",
      "Open system Settings to disable Aloya notifications.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
  }

  function onToggle() {
    if (pending) return;
    if (status === "on") return void disable();
    if (status === "denied") return void Linking.openSettings();
    if (status === "off") return void enable();
  }

  const interactive = status === "on" || status === "off" || status === "denied";
  const isOn = status === "on";

  const copy = {
    unknown: { line: "Checking notification permission…", tone: palette.inkSoft },
    unsupported: {
      line: "Push isn't available on this device — try a physical phone build.",
      tone: palette.inkSoft,
    },
    denied: {
      line: "Notifications are blocked. Re-enable in iOS or Android settings.",
      tone: palette.ochre,
    },
    off: {
      line: "Get pinged when your bus is boarding, your stop is next, or a delay matters.",
      tone: palette.inkSoft,
    },
    on: {
      line: "We'll only ping you for the moments that matter on your trip.",
      tone: palette.olive,
    },
  }[status];

  return (
    <View
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 28,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 22,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 10,
              letterSpacing: 2,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            Quiet alerts
          </Text>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 24,
              lineHeight: 28,
              letterSpacing: -0.6,
              color: palette.ink,
              marginTop: 6,
            }}
          >
            Pings worth{" "}
            <Text style={{ color: palette.aegeanDeep, fontStyle: "italic" }}>
              looking up for
            </Text>
          </Text>
        </View>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2,
            color: isOn
              ? palette.olive
              : status === "denied"
                ? palette.ochre
                : palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          {isOn ? "Live" : status === "denied" ? "Blocked" : "Off"}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 14,
          lineHeight: 20,
          color: copy.tone,
          marginTop: 12,
        }}
      >
        {copy.line}
      </Text>

      <View
        style={{
          marginTop: 22,
          flexDirection: "row",
          alignItems: "center",
          gap: 18,
        }}
      >
        <Pressable
          onPress={onToggle}
          disabled={!interactive || pending}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOn, disabled: !interactive || pending }}
          style={({ pressed }) => ({
            width: 112,
            height: 56,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: isOn ? palette.aegeanDeep : palette.line,
            backgroundColor: isOn ? palette.aegeanDeep : palette.limestoneSoft,
            justifyContent: "center",
            paddingHorizontal: 6,
            opacity: !interactive || pending ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            overflow: "hidden",
            shadowColor: isOn ? palette.aegeanDeep : "#1F1E18",
            shadowOpacity: isOn ? 0.28 : 0.08,
            shadowRadius: isOn ? 18 : 8,
            shadowOffset: { width: 0, height: 8 },
          })}
        >
          {isOn && (
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="notif-g" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={palette.aegean} />
                  <Stop offset="1" stopColor={palette.aegeanDeep} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" rx="28" fill="url(#notif-g)" />
            </Svg>
          )}
          <Text
            style={{
              position: "absolute",
              left: 16,
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 9,
              letterSpacing: 1.8,
              color: "rgba(246,241,231,0.9)",
              opacity: isOn ? 1 : 0,
            }}
          >
            ON
          </Text>
          <Text
            style={{
              position: "absolute",
              right: 15,
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 9,
              letterSpacing: 1.8,
              color: palette.inkSoft,
              opacity: isOn ? 0 : 1,
            }}
          >
            OFF
          </Text>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: palette.white,
              alignSelf: isOn ? "flex-end" : "flex-start",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
            }}
          >
            {pending ? (
              <ActivityIndicator size="small" color={palette.aegeanDeep} />
            ) : (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: isOn ? palette.aegeanDeep : "rgba(90,87,78,0.4)",
                }}
              />
            )}
          </View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 17,
              lineHeight: 21,
              color: palette.ink,
            }}
          >
            {isOn ? "Alerts on" : "Alerts off"}
          </Text>
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 10,
              letterSpacing: 1.8,
              color: palette.inkSoft,
              textTransform: "uppercase",
              marginTop: 4,
            }}
            numberOfLines={2}
          >
            {pending
              ? "Working…"
              : isOn
                ? "Silenced when nothing matters"
                : status === "denied"
                  ? `Unblock in ${Platform.OS === "ios" ? "iOS" : "Android"} settings`
                  : status === "unsupported"
                    ? "Unavailable here"
                    : "Tap to enable"}
          </Text>
        </View>
      </View>

      {message ? (
        <Text
          style={{
            marginTop: 14,
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 11,
            letterSpacing: 0.4,
            color: palette.inkSoft,
          }}
        >
          {message}
        </Text>
      ) : null}

      <View style={{ marginTop: 22, gap: 8 }}>
        {[
          { k: "01", t: "Boarding", d: "We tell you when your bus is at the stop." },
          { k: "02", t: "Your stop", d: "A quiet ping before the doors open." },
          { k: "03", t: "Delays", d: "Only when the change is material." },
        ].map((x) => (
          <View
            key={x.k}
            style={{
              borderRadius: 16,
              backgroundColor: palette.limestoneSoft,
              borderWidth: 1,
              borderColor: palette.line,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 10,
                letterSpacing: 1.8,
                color: palette.inkSoft,
                textTransform: "uppercase",
              }}
            >
              {x.k}
            </Text>
            <Text
              style={{
                fontFamily: "BricolageGrotesque_700Bold",
                fontSize: 17,
                color: palette.ink,
                marginTop: 2,
              }}
            >
              {x.t}
            </Text>
            <Text
              style={{
                fontFamily: "Geist_500Medium",
                fontSize: 12,
                color: palette.inkSoft,
                marginTop: 2,
              }}
            >
              {x.d}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
