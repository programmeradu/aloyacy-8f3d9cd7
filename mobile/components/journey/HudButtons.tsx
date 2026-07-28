// Shared HUD button chrome + the kicker type style used by every HUD card.

import { View, Text, Pressable } from "react-native";
import { palette } from "@/constants/theme";

export const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexShrink: 1,
        backgroundColor: palette.ink,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 999,
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 13,
          color: palette.limestone,
          letterSpacing: -0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexShrink: 1,
        backgroundColor: palette.white,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 13,
          color: palette.ink,
          letterSpacing: -0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Big pill CTA used by the Start / I'm off / Finish cards. */
export function HeroButton({
  label,
  onPress,
  tone = "ink",
}: {
  label: string;
  onPress: () => void;
  tone?: "ink" | "limestone";
}) {
  const dark = tone === "ink";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        marginTop: 18,
        backgroundColor: dark ? palette.ink : palette.limestone,
        paddingHorizontal: 22,
        paddingVertical: 14,
        borderRadius: 999,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 14,
          color: dark ? palette.limestone : palette.ink,
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Common outer padding + rounded surface for every HUD card. */
export function HudCard({
  children,
  background,
  borderColor,
}: {
  children: React.ReactNode;
  background: string;
  borderColor?: string;
}) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: background,
          borderWidth: borderColor ? 1 : 0,
          borderColor: borderColor ?? "transparent",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function HudTitle({
  children,
  size = 28,
  color = palette.ink,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <Text
      style={{
        marginTop: 8,
        fontFamily: "BricolageGrotesque_800ExtraBold",
        fontSize: size,
        lineHeight: size + 4,
        letterSpacing: -0.6,
        color,
      }}
    >
      {children}
    </Text>
  );
}

export function HudBody({
  children,
  color = palette.inkSoft,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Text
      style={{
        marginTop: 8,
        fontFamily: "Geist_500Medium",
        fontSize: 13,
        lineHeight: 20,
        color,
      }}
    >
      {children}
    </Text>
  );
}
