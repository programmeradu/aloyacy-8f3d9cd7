// Native CardScanSheet for Aloya — Wave 4 mobile OCR.
//
// Flow:
//   1. Modal opens with the camera live preview and a side toggle (Front / Back).
//   2. Every ~1.5 s while "scanning", we snap a still, downscale to ~720px wide
//      (CameraView does the scaling for us via `quality`), and POST it to
//      /api/public/wallet/ocr.
//   3. Two consecutive matches for the same field promote it to "captured".
//      The toggle auto-flips to the other side when the active one is done.
//      When both sides are captured we persist and dismiss.
//   4. The user can also tap "Capture now" to force a frame, or "Skip side"
//      if a field is missing in real life (e.g. plain unbranded back).
//
// Design notes:
//   - Full-bleed dark surface so the live camera reads as the hero. Editorial
//     typography (Bricolage display + JetBrains mono labels) matches the rest
//     of the app — no generic camera-UI clichés.
//   - Corner brackets sized to a real Motion card aspect (1.586:1, ISO/IEC 7810).
//   - Status copy is always actionable; no infinite spinners.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { scanCardSide, type ScannedFields } from "@/lib/cardScan";
import {
  formatCardNumber,
  mergePass,
  type MotionPass,
} from "@/lib/motionPass";

type Side = "front" | "back";

type Detected = {
  number?: string;
  holder?: string;
  validUntil?: string;
};

type Hits = { number: number; holder: number; validUntil: number };

const SCAN_INTERVAL_MS = 1500;
const PROMOTE_AT = 2; // consecutive matches to lock a field

export function CardScanSheet({
  visible,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured?: (pass: MotionPass) => void;
}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [side, setSide] = useState<Side>("front");
  const sideRef = useRef<Side>("front");
  const [detected, setDetected] = useState<Detected>({});
  const accRef = useRef<Detected>({});
  const hitsRef = useRef<Hits>({ number: 0, holder: 0, validUntil: 0 });
  const frontDoneRef = useRef(false);
  const backDoneRef = useRef(false);
  const [status, setStatus] = useState<
    "permission" | "ready" | "scanning" | "saving" | "done" | "error"
  >("permission");
  const [errMsg, setErrMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);
  const sweep = useRef(new Animated.Value(0)).current;

  // Permissions ---------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    cancelledRef.current = false;
    if (!permission) return;
    if (permission.granted) {
      setStatus("scanning");
    } else if (permission.canAskAgain) {
      requestPermission().then((p) => {
        setStatus(p.granted ? "scanning" : "permission");
      });
    } else {
      setStatus("permission");
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [visible, permission, requestPermission]);

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    accRef.current = {};
    hitsRef.current = { number: 0, holder: 0, validUntil: 0 };
    frontDoneRef.current = false;
    backDoneRef.current = false;
    sideRef.current = "front";
    setSide("front");
    setDetected({});
    setErrMsg("");
  }, [visible]);

  // Sweep animation
  useEffect(() => {
    if (status !== "scanning") {
      sweep.stopAnimation();
      sweep.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [status, sweep]);

  const switchSide = useCallback((next: Side) => {
    sideRef.current = next;
    setSide(next);
    hitsRef.current = { number: 0, holder: 0, validUntil: 0 };
  }, []);

  const finishIfComplete = useCallback(async () => {
    if (!frontDoneRef.current || !backDoneRef.current) return false;
    const acc = accRef.current;
    if (!acc.number) return false;
    setStatus("saving");
    const next = await mergePass({
      number: acc.number,
      holder: acc.holder ?? undefined,
      validUntil: acc.validUntil ?? undefined,
      lastScanAt: Date.now(),
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStatus("done");
    onCaptured?.(next);
    setTimeout(onClose, 700);
    return true;
  }, [onClose, onCaptured]);

  const ingest = useCallback(
    async (result: ScannedFields) => {
      const acc = accRef.current;
      const hits = hitsRef.current;
      const currentSide = sideRef.current;

      if (currentSide === "back") {
        if (result.number) {
          if (acc.number === result.number) hits.number++;
          else {
            acc.number = result.number;
            hits.number = 1;
          }
          if (hits.number >= PROMOTE_AT && !backDoneRef.current) {
            backDoneRef.current = true;
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (!frontDoneRef.current) switchSide("front");
            else await finishIfComplete();
          }
        }
      } else {
        if (result.holder) {
          if (acc.holder === result.holder) hits.holder++;
          else {
            acc.holder = result.holder;
            hits.holder = 1;
          }
        }
        if (result.validUntil) {
          if (acc.validUntil === result.validUntil) hits.validUntil++;
          else {
            acc.validUntil = result.validUntil;
            hits.validUntil = 1;
          }
        }
        const holderOk = !!acc.holder && hits.holder >= PROMOTE_AT;
        const dateOk = !!acc.validUntil && hits.validUntil >= PROMOTE_AT;
        // Promote when both fields lock, or when at least one is solid and
        // the user has accumulated enough total observations on the front.
        const enough =
          (holderOk && dateOk) ||
          ((holderOk || dateOk) &&
            hits.holder + hits.validUntil >= PROMOTE_AT * 2);
        if (enough && !frontDoneRef.current) {
          frontDoneRef.current = true;
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (!backDoneRef.current) switchSide("back");
          else await finishIfComplete();
        }
      }
      setDetected({ ...acc });
    },
    [finishIfComplete, switchSide],
  );

  const captureFrame = useCallback(async () => {
    if (busy || cancelledRef.current) return;
    const cam = cameraRef.current;
    if (!cam) return;
    setBusy(true);
    try {
      const photo = await cam.takePictureAsync({
        quality: 0.55,
        base64: true,
        skipProcessing: true,
        exif: false,
      });
      if (!photo?.base64) return;
      const result = await scanCardSide({
        side: sideRef.current,
        base64: photo.base64,
        mimeType: "image/jpeg",
      });
      if ("error" in result) {
        setErrMsg(result.error);
        return;
      }
      setErrMsg("");
      if (result.confidence >= 0.6) await ingest(result);
    } catch (e) {
      setErrMsg((e as Error).message ?? "Capture failed");
    } finally {
      setBusy(false);
    }
  }, [busy, ingest]);

  // Auto-capture loop
  useEffect(() => {
    if (!visible || status !== "scanning") return;
    let alive = true;
    const tick = async () => {
      while (alive && !cancelledRef.current && status === "scanning") {
        await captureFrame();
        await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [visible, status, captureFrame]);

  const sideHint = useMemo(
    () =>
      side === "front"
        ? "Front · name & valid until"
        : "Back · 14–16 digit number",
    [side],
  );

  const sweepY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 220],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top + 14 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Scan your Motion card</Text>
          <Pressable
            onPress={() => {
              cancelledRef.current = true;
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        </View>

        {/* Side toggle */}
        <View style={styles.toggle}>
          {(["front", "back"] as const).map((s) => {
            const active = side === s;
            const done = s === "front" ? frontDoneRef.current : backDoneRef.current;
            return (
              <Pressable
                key={s}
                onPress={() => switchSide(s)}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
              >
                <Text
                  style={[
                    styles.toggleLabel,
                    active && styles.toggleLabelActive,
                  ]}
                >
                  {s}
                  {done ? "  ✓" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Camera viewport */}
        <View style={styles.viewport}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              autofocus="on"
              ratio="16:9"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.permissionPanel]}>
              <Text style={styles.permissionTitle}>Camera access needed</Text>
              <Text style={styles.permissionBody}>
                Aloya only opens the camera while you're scanning your card. No
                images are stored.
              </Text>
              <Pressable
                onPress={() => requestPermission().then((p) => p.granted && setStatus("scanning"))}
                style={({ pressed }) => [
                  styles.permissionBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.permissionBtnLabel}>Allow camera</Text>
              </Pressable>
            </View>
          )}

          {/* Card-shaped frame overlay */}
          {permission?.granted && (
            <View pointerEvents="none" style={styles.frameWrap}>
              <View style={styles.frame}>
                {(["tl", "tr", "bl", "br"] as const).map((p) => (
                  <View
                    key={p}
                    style={[
                      styles.corner,
                      p === "tl" && { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
                      p === "tr" && { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
                      p === "bl" && { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
                      p === "br" && { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
                    ]}
                  />
                ))}
                {status === "scanning" && (
                  <Animated.View
                    style={[
                      styles.sweep,
                      { transform: [{ translateY: sweepY }] },
                    ]}
                  />
                )}
              </View>
            </View>
          )}

          {/* Status badge */}
          <View style={styles.statusBadge} pointerEvents="none">
            <Text style={styles.statusText}>
              {status === "permission" && "Awaiting camera access"}
              {status === "scanning" && (busy ? "Reading…" : sideHint)}
              {status === "saving" && "Saving"}
              {status === "done" && "Captured"}
              {status === "error" && (errMsg || "Camera unavailable")}
            </Text>
          </View>
        </View>

        {/* Detected readout */}
        <View style={styles.readout}>
          <FieldRow
            label="Number (back)"
            value={
              detected.number ? formatCardNumber(detected.number) : ""
            }
            locked={backDoneRef.current}
          />
          <FieldRow
            label="Name (front)"
            value={detected.holder ?? ""}
            locked={frontDoneRef.current && !!detected.holder}
          />
          <FieldRow
            label="Valid until (front)"
            value={detected.validUntil ?? ""}
            locked={frontDoneRef.current && !!detected.validUntil}
          />
        </View>

        {/* Actions */}
        <View
          style={[
            styles.actions,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          <Pressable
            onPress={captureFrame}
            disabled={status !== "scanning" || busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || busy) && { opacity: 0.75 },
              status !== "scanning" && { opacity: 0.4 },
            ]}
          >
            <Text style={styles.primaryBtnLabel}>
              {busy ? "Reading" : "Capture now"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const cur = sideRef.current;
              if (cur === "front") frontDoneRef.current = true;
              else backDoneRef.current = true;
              if (!frontDoneRef.current || !backDoneRef.current) {
                switchSide(cur === "front" ? "back" : "front");
              } else {
                finishIfComplete();
              }
            }}
            disabled={status === "saving" || status === "done"}
            style={({ pressed }) => [
              styles.ghostBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.ghostBtnLabel}>Skip this side</Text>
          </Pressable>
          <Text style={styles.footnote}>
            Hold steady · entire card inside the frame
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function FieldRow({
  label,
  value,
  locked,
}: {
  label: string;
  value: string;
  locked: boolean;
}) {
  const has = value.length > 0;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[
          styles.fieldValue,
          has && styles.fieldValueOn,
          locked && styles.fieldValueLocked,
        ]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {has ? value : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.ink,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "rgba(246,241,231,0.75)",
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(246,241,231,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeGlyph: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 26,
    lineHeight: 28,
    color: palette.limestone,
    marginTop: Platform.OS === "ios" ? -2 : -4,
  },
  toggle: {
    marginTop: 14,
    flexDirection: "row",
    backgroundColor: "rgba(246,241,231,0.08)",
    borderRadius: 999,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: palette.ochre,
  },
  toggleLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "rgba(246,241,231,0.7)",
  },
  toggleLabelActive: {
    color: palette.ink,
  },
  viewport: {
    flex: 1,
    marginTop: 14,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(246,241,231,0.16)",
  },
  permissionPanel: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
    backgroundColor: palette.ink,
  },
  permissionTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 22,
    color: palette.limestone,
    textAlign: "center",
  },
  permissionBody: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(246,241,231,0.7)",
    textAlign: "center",
  },
  permissionBtn: {
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: palette.ochre,
  },
  permissionBtnLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  frameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  frame: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1.586,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: palette.ochre,
    borderRadius: 6,
  },
  sweep: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: palette.ochre,
    shadowColor: palette.ochre,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  statusBadge: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(31,30,24,0.7)",
  },
  statusText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: palette.limestone,
  },
  readout: {
    marginTop: 12,
    gap: 8,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(246,241,231,0.06)",
    borderWidth: 1,
    borderColor: "rgba(246,241,231,0.10)",
    gap: 14,
  },
  fieldLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(246,241,231,0.55)",
    flexShrink: 0,
  },
  fieldValue: {
    flex: 1,
    textAlign: "right",
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 13,
    color: "rgba(246,241,231,0.3)",
  },
  fieldValueOn: {
    color: palette.ochre,
  },
  fieldValueLocked: {
    color: "#9BE3A4",
  },
  actions: {
    paddingTop: 14,
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: palette.ochre,
    alignItems: "center",
  },
  primaryBtnLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
    color: palette.ink,
    letterSpacing: 0.2,
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostBtnLabel: {
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    color: "rgba(246,241,231,0.65)",
  },
  footnote: {
    textAlign: "center",
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(246,241,231,0.4)",
    marginTop: 4,
  },
});
