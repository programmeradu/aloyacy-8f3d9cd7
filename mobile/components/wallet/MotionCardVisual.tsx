// Motion Card visual — native reproduction of the printed plastic.
//
// Editorial-grade: photoreal aegean gradient body, holder + tier band
// under the wordmark, valid-until below, live QR (the card number) in
// the top-right photo square. Overlays are all typographic — no
// generic icon set. Renders at any width; scales via aspectRatio.

import { Pressable, Text, View, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Svg, { Defs, LinearGradient, Rect, Stop, Path } from "react-native-svg";
import { palette } from "@/constants/theme";
import { formatCardNumber, type MotionPass } from "@/lib/motionPass";
import * as Haptics from "expo-haptics";

export function MotionCardVisual({
  pass,
  onTap,
  onScan,
}: {
  pass: MotionPass;
  onTap: () => void;
  onScan?: () => void;
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
          {/* Painted background — editorial aegean-to-lagoon gradient stands in
              for the Motion card face artwork. */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#12455B" />
                <Stop offset="0.55" stopColor="#1F6C82" />
                <Stop offset="1" stopColor="#0E2F44" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill="url(#g)" />
            {/* Wordmark strokes as decorative lines */}
            <Path
              d="M6 20 L60 20"
              stroke="#E7D6A8"
              strokeWidth={1.5}
              opacity={0.7}
            />
          </Svg>

          {/* Wordmark */}
          <View style={styles.wordmark}>
            <Text style={styles.brandTop}>MOTION</Text>
            <Text style={styles.brandBottom}>BUS CARD</Text>
          </View>

          {/* QR — printed top-right square */}
          <View style={styles.qr}>
            <QRCode value={qrValue} size={80} color="#12455B" backgroundColor="#FFFFFF" />
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

          {/* Valid until printed strip */}
          <View style={styles.validRow}>
            <Text style={styles.validLabel}>ΙΣΧΥΕΙ ΜΕΧΡΙ / VALID UNTIL</Text>
            <Text style={styles.validValue}>{validUntil}</Text>
          </View>

          {/* Card number strip along the bottom */}
          <View style={styles.numberStrip}>
            <Text style={styles.numberText}>
              {hasCard ? formatCardNumber(pass.number) : "•• •••• •••• ••"}
            </Text>
          </View>
        </View>
      </Pressable>

      {onScan && (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onScan();
          }}
          style={styles.scanBtn}
          accessibilityLabel="Scan card with camera"
        >
          <Text style={styles.scanLabel}>SCAN</Text>
        </Pressable>
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
    shadowColor: "#0C2432",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  wordmark: {
    position: "absolute",
    top: 18,
    left: 18,
  },
  brandTop: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    color: "#E7D6A8",
    fontSize: 22,
    letterSpacing: 1.2,
    lineHeight: 22,
  },
  brandBottom: {
    fontFamily: "JetBrainsMono_500Medium",
    color: "#E7D6A8",
    fontSize: 10,
    letterSpacing: 3,
    marginTop: 2,
  },
  qr: {
    position: "absolute",
    top: "16%",
    right: "6%",
    backgroundColor: "#FFF",
    padding: 6,
    borderRadius: 4,
  },
  holderBand: {
    position: "absolute",
    top: "44%",
    left: 20,
    right: "45%",
  },
  holderName: {
    fontFamily: "Geist_600SemiBold",
    color: "#EFC98C",
    fontSize: 14,
    letterSpacing: 1.1,
  },
  tier: {
    marginTop: 4,
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 1.8,
    color: "#B9DFEC",
  },
  validRow: {
    position: "absolute",
    bottom: 46,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  validLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 8,
    letterSpacing: 1.6,
    color: "rgba(231,214,168,0.75)",
  },
  validValue: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 12,
    letterSpacing: 1.4,
    color: "#EFC98C",
  },
  numberStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "rgba(6,20,32,0.55)",
  },
  numberText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 14,
    letterSpacing: 3,
    color: "#F6F1E7",
  },
  scanBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15,26,32,0.9)",
  },
  scanLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.limestone,
  },
  tapHint: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2.4,
    color: palette.inkSoft,
  },
});
