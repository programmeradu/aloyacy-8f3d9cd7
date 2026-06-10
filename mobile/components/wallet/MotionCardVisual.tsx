// Motion Card visual — native reproduction of the printed plastic.
//
// Editorial-grade: uses the same generated Motion card artwork as web, then
// overlays holder/tier/expiry and the live QR in the printed positions.

import { Image, Pressable, Text, View, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import { type MotionPass } from "@/lib/motionPass";
import * as Haptics from "expo-haptics";

export function MotionCardVisual({
  pass,
  onTap,
  onScan,
  onNfc,
}: {
  pass: MotionPass;
  onTap: () => void;
  onScan?: () => void;
  onNfc?: () => void;
}) {
  const hasCard = pass.number.replace(/\D/g, "").length >= 8;
  const qrValue = hasCard ? pass.number.replace(/\D/g, "") : "MOTION-DEMO";
  const holderName =
    (pass.holder?.trim() || pass.jcc?.displayName?.trim() || "").toUpperCase() ||
    "ADD YOUR NAME";
  const tierLabel = (pass.tier?.trim() || "18+ STANDARD").toUpperCase();
  const validUntil = pass.validUntil?.trim() || "—/—/——";

  return (
    <View style={{ position: "relative" }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onTap();
        }}
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.995 : 1 }],
        })}
      >
        <View style={styles.card}>
          <Image
            source={assets.motion_card_base}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />

          {/* QR — printed top-right square */}
          <View style={styles.qr}>
            <QRCode value={qrValue} size={82} color="#1A2A6C" backgroundColor="#FFFFFF" />
          </View>

          {/* Holder + tier */}
          <View style={styles.holderBand}>
            <Text
              numberOfLines={1}
              style={[
                styles.holderName,
                { opacity: hasCard ? 1 : 0.55 },
              ]}
            >
              {holderName}
            </Text>
            <Text style={styles.tier} numberOfLines={1}>{tierLabel}</Text>
          </View>

          {/* Valid until — aligned to the printed label on the real artwork. */}
          <View style={styles.validRow}>
            <Text style={styles.validValue}>{validUntil}</Text>
          </View>
        </View>
      </Pressable>

      {onScan && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onScan();
            }}
            style={styles.actionBtn}
            accessibilityLabel="Scan card with camera"
          >
            <Text style={styles.actionLabel}>CAMERA</Text>
          </Pressable>
          {onNfc && (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onNfc();
              }}
              style={[styles.actionBtn, { backgroundColor: palette.aegeanDeep }]}
              accessibilityLabel="Scan card with NFC"
            >
              <Text style={styles.actionLabel}>TAP CARD</Text>
            </Pressable>
          )}
        </View>
      )}

      {!hasCard && (
        <Text style={styles.tapHint}>TAP TO SET UP</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1.586,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#081C28",
    shadowOpacity: 0.32,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
  },
  qr: {
    position: "absolute",
    top: "17%",
    left: "58%",
    width: "36%",
    height: "56%",
    backgroundColor: "#FFF",
    padding: "2.2%",
    alignItems: "center",
    justifyContent: "center",
  },
  holderBand: {
    position: "absolute",
    top: "37%",
    left: "5%",
    right: "45%",
  },
  holderName: {
    fontFamily: "Geist_600SemiBold",
    color: "#9B1C1C",
    fontSize: 13,
    letterSpacing: 0.4,
  },
  tier: {
    marginTop: 4,
    fontFamily: "Geist_500Medium",
    fontSize: 10,
    letterSpacing: 0.9,
    color: "#1A2A6C",
  },
  validRow: {
    position: "absolute",
    top: "68%",
    left: "33%",
    width: "24%",
    alignItems: "center",
  },
  validValue: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
    color: "#1A2A6C",
  },
  actionRow: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15,26,32,0.9)",
  },
  actionLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.limestone,
  },
  tapHint: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.4,
    color: palette.inkSoft,
  },
});
