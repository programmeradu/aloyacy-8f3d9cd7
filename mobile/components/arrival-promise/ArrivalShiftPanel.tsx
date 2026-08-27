// Native twin of the web shift panel: when a promise is out of reach, offer
// measured "+N min" options and let the rider move the promise in one tap.

import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import {
  formatClock,
  formatDayLabel,
  shiftHeadline,
  shiftOptionLine,
  shiftOptionName,
  suggestArrivalShift,
  type LadderRung,
  type MarginPref,
} from "@aloya/core/arrival-promise";
import { palette } from "@/constants/theme";
import { adjustPromise } from "@/lib/arrival-promise";

export function ArrivalShiftPanel({
  promiseId,
  ladder,
  targetArrivalUnix,
  margin,
  bufferSec,
  destinationLabel,
  nowUnix,
  onChanged,
}: {
  promiseId: string;
  ladder: LadderRung[];
  targetArrivalUnix: number;
  margin: MarginPref;
  bufferSec: number;
  destinationLabel: string;
  nowUnix: number;
  onChanged: () => Promise<void> | void;
}) {
  const suggestion = useMemo(
    () => suggestArrivalShift({ ladder, targetArrivalUnix, margin, bufferSec, nowUnix }),
    [ladder, targetArrivalUnix, margin, bufferSec, nowUnix],
  );

  const [picked, setPicked] = useState<number | null>(null);
  const [customUnix, setCustomUnix] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!suggestion) return null;

  const chosenExtra = picked ?? suggestion.recommended?.extraSec ?? null;
  const chosen =
    suggestion.options.find((o) => o.extraSec === chosenExtra) ?? suggestion.recommended;
  const commitUnix = customUnix ?? chosen?.newTargetUnix ?? null;

  const commit = async () => {
    if (!commitUnix) return;
    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await adjustPromise(promiseId, commitUnix);
      await onChanged();
    } catch (e) {
      Alert.alert(
        "Could not move the arrival",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        marginTop: 14,
        borderRadius: 20,
        padding: 14,
        backgroundColor: palette.limestoneSoft,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.ink,
        }}
      >
        {shiftHeadline(suggestion, targetArrivalUnix)}
      </Text>

      <Text
        style={{
          marginTop: 12,
          fontFamily: "JetBrainsMono_600SemiBold",
          fontSize: 9.5,
          letterSpacing: 1.3,
          color: palette.inkSoft,
        }}
      >
        GIVE IT ROOM
      </Text>

      <View style={{ marginTop: 8, gap: 8 }}>
        {suggestion.options.map((o) => {
          const active = !customUnix && o.extraSec === chosen?.extraSec;
          return (
            <Pressable
              key={o.extraSec}
              accessibilityRole="button"
              onPress={() => {
                void Haptics.selectionAsync();
                setPicked(o.extraSec);
                setCustomUnix(null);
              }}
              style={{
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 11,
                backgroundColor: active ? palette.ink : palette.white,
                borderWidth: 1,
                borderColor: active ? palette.ink : palette.line,
              }}
            >
              <Text
                style={{
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 13,
                  color: active ? palette.limestone : palette.ink,
                }}
              >
                {shiftOptionName(o.kind)}
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: "Geist_500Medium",
                  fontSize: 12,
                  lineHeight: 17,
                  color: active ? palette.limestone : palette.inkSoft,
                  opacity: active ? 0.85 : 1,
                }}
              >
                {shiftOptionLine(o)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setPickerOpen(true)}
        style={{ marginTop: 12 }}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12.5, color: palette.aegeanDeep }}>
          {customUnix
            ? `Custom · ${formatClock(customUnix)} ${formatDayLabel(customUnix, nowUnix)}`
            : "Or pick a time"}
        </Text>
      </Pressable>

      {pickerOpen ? (
        <DateTimePicker
          value={new Date((commitUnix ?? nowUnix + 900) * 1000)}
          mode="datetime"
          minimumDate={new Date((nowUnix + 300) * 1000)}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, date) => {
            if (Platform.OS !== "ios") setPickerOpen(false);
            if (date) {
              setCustomUnix(Math.floor(date.getTime() / 1000));
              setPicked(null);
            }
          }}
        />
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy || !commitUnix}
        onPress={() => void commit()}
        style={{
          marginTop: 14,
          height: 42,
          borderRadius: 21,
          paddingHorizontal: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.aegean,
          opacity: busy || !commitUnix ? 0.6 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={palette.limestone} />
        ) : (
          <Text
            numberOfLines={2}
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 13,
              lineHeight: 17,
              textAlign: "center",
              color: palette.limestone,
            }}
          >
            {commitUnix
              ? `Hold ${destinationLabel} by ${formatClock(commitUnix)} ${formatDayLabel(commitUnix, nowUnix)}`
              : "Pick a new time"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
