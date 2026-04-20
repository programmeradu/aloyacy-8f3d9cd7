// Renewable passes list — pulled from the public top-up portal.
// Tapping the price copies the card number and opens the portal.

import { useState } from "react";
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import type { MotionPassOption } from "@/lib/motionPass";

const TOPUP_URL = "https://www.publictransport.com.cy/topup/page/topup-travel-card";

export function RenewPasses({
  cardNumber,
  passes,
}: {
  cardNumber: string;
  passes: MotionPassOption[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (passes.length === 0) return null;
  const clean = cardNumber.replace(/\D/g, "");

  async function handle(code: string) {
    try {
      await Clipboard.setStringAsync(clean);
      setCopied(code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2200);
    } catch { /* noop */ }
    void Linking.openURL(TOPUP_URL);
  }

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>
          Renew a <Text style={styles.italic}>pass</Text>
        </Text>
        <Text style={styles.count}>{passes.length} eligible</Text>
      </View>
      <View style={styles.list}>
        {passes.map((p, i) => (
          <View
            key={p.code}
            style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.meta}>
                {copied === p.code
                  ? "Card number copied — paste in the portal"
                  : p.validityDays
                    ? `${p.validityDays} days validity`
                    : `Pass ${p.code}`}
              </Text>
            </View>
            <Pressable onPress={() => handle(p.code)} style={styles.priceBtn}>
              <Text style={styles.price}>€{p.priceEur.toFixed(2)}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Text style={styles.foot}>
        Opens the official top-up portal — nothing is charged inside Aloya.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  title: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  italic: { fontStyle: "italic", color: palette.aegeanDeep },
  count: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  list: {
    backgroundColor: palette.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  name: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.ink,
  },
  meta: {
    marginTop: 4,
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 9,
    letterSpacing: 1.4,
    color: palette.inkSoft,
  },
  priceBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.ink,
    borderRadius: 999,
  },
  price: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    color: palette.limestone,
  },
  foot: {
    marginTop: 10,
    fontFamily: "Geist_500Medium",
    fontSize: 11,
    color: palette.inkSoft,
  },
});
