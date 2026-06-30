// "Leave now" / "Depart at" / "Arrive by" picker. Native iOS/Android
// date+time wheel via @react-native-community/datetimepicker, wrapped in
// an Aloya editorial chip row.
import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";

export type TimeIntent =
  | { kind: "now" }
  | { kind: "leaveBy"; iso: string }
  | { kind: "arriveBy"; iso: string };

function fmtChip(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}

export function TimePicker({
  value,
  onChange,
}: {
  value: TimeIntent;
  onChange: (next: TimeIntent) => void;
}) {
  const [picking, setPicking] = useState<"leaveBy" | "arriveBy" | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  function setMode(mode: TimeIntent["kind"]) {
    Haptics.selectionAsync().catch(() => {});
    if (mode === "now") {
      onChange({ kind: "now" });
      setPicking(null);
      return;
    }
    if (value.kind === mode) {
      // Tap same chip → reopen the picker to adjust.
      setPendingDate(new Date(value.iso));
      setPicking(mode);
      return;
    }
    const initial = new Date(Date.now() + 30 * 60_000);
    setPendingDate(initial);
    setPicking(mode);
  }

  function handlePickerEvent(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      // Android fires one event per dismiss/confirm.
      setPicking(null);
      if (event.type === "set" && selected && picking) {
        onChange({ kind: picking, iso: selected.toISOString() });
      }
      setPendingDate(null);
      return;
    }
    // iOS: live update; commit happens via the "Done" button below.
    if (selected) setPendingDate(selected);
  }

  function commitIOS() {
    if (picking && pendingDate) {
      onChange({ kind: picking, iso: pendingDate.toISOString() });
    }
    setPicking(null);
    setPendingDate(null);
  }

  const chipBase = {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  } as const;

  function Chip({
    label,
    active,
    subLabel,
    onPress,
  }: {
    label: string;
    active: boolean;
    subLabel?: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          ...chipBase,
          backgroundColor: active ? palette.ink : palette.white,
          borderColor: active ? palette.ink : palette.line,
          opacity: pressed ? 0.85 : 1,
          flexDirection: "row",
          alignItems: "baseline",
          gap: 8,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 13,
            color: active ? palette.white : palette.ink,
          }}
        >
          {label}
        </Text>
        {subLabel ? (
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 11,
              color: active ? palette.limestoneSoft : palette.inkSoft,
              letterSpacing: 0.3,
            }}
          >
            {subLabel}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip
          label="Leave now"
          active={value.kind === "now"}
          onPress={() => setMode("now")}
        />
        <Chip
          label="Depart at"
          active={value.kind === "leaveBy"}
          subLabel={value.kind === "leaveBy" ? fmtChip(value.iso) : undefined}
          onPress={() => setMode("leaveBy")}
        />
        <Chip
          label="Arrive by"
          active={value.kind === "arriveBy"}
          subLabel={value.kind === "arriveBy" ? fmtChip(value.iso) : undefined}
          onPress={() => setMode("arriveBy")}
        />
      </View>

      {picking && pendingDate && (
        <View
          style={{
            backgroundColor: palette.white,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.line,
            padding: Platform.OS === "ios" ? 8 : 0,
          }}
        >
          <DateTimePicker
            value={pendingDate}
            mode={Platform.OS === "ios" ? "datetime" : "datetime"}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={new Date()}
            onChange={handlePickerEvent}
          />
          {Platform.OS === "ios" && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                paddingHorizontal: 8,
                paddingBottom: 8,
              }}
            >
              <Pressable
                onPress={() => {
                  setPicking(null);
                  setPendingDate(null);
                }}
                style={{ paddingVertical: 8, paddingHorizontal: 14 }}
              >
                <Text
                  style={{
                    fontFamily: "Geist_600SemiBold",
                    color: palette.inkSoft,
                    fontSize: 14,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={commitIOS}
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  backgroundColor: palette.ink,
                  borderRadius: 999,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: "Geist_700Bold",
                    color: palette.white,
                    fontSize: 14,
                  }}
                >
                  Set time
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
