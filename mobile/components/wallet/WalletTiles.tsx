// Small presentational pieces of the Wallet tab: the two quick-action tiles
// under the card, and the settings rows at the bottom of the screen.

import { Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { walletStyles as s } from "./walletScreenStyles";

export function ActionTile({
  eyebrow,
  value,
  foot,
  onPress,
  tone = "default",
}: {
  eyebrow: string;
  value: string;
  foot: string;
  onPress: () => void;
  tone?: "default" | "aegean";
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${value}`}
      style={s.tile}
    >
      <Text style={s.tileEyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text
        style={[s.tileValue, tone === "aegean" && { color: palette.aegeanDeep }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <Text style={s.tileFoot} numberOfLines={2}>
        {foot}
      </Text>
    </Pressable>
  );
}

export function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={s.settingsRow}>
      <Text style={s.settingsLabel}>{label}</Text>
      <Text style={s.settingsValue} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </Pressable>
  );
}
