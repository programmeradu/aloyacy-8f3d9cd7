// Native CardScanSheet for Aloya — Wave 4 mobile OCR.
//
// Flow:
//   1. Modal opens with the camera live preview and a side toggle (Front / Back).
//   2. Every ~1.5 s while "scanning", we snap a still and POST it to
//      /api/public/wallet/ocr.
//   3. Promotion rules (how many consistent readings lock a field, when the
//      toggle auto-flips, when both sides are done) live in
//      @aloya/core/card-scan-state so they are testable without a camera.
//   4. The user can force a frame with "Capture now", or "Skip this side" when
//      a field is genuinely absent (e.g. a plain unbranded back).

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CameraView } from "expo-camera";
import { useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import {
  ingestScanFields,
  initialScanState,
  resetHits,
  sideHint,
  skipScanSide,
  type ScanIngest,
  type ScanSide,
  type ScanState,
} from "@aloya/core/card-scan-state";
import { scanCardSide } from "@/lib/cardScan";
import { mergePass, type MotionPass } from "@/lib/motionPass";
import { ScanViewport, type ScanStatus } from "./card-scan/ScanViewport";
import { ScanReadout } from "./card-scan/ScanReadout";
import { scanStyles as s } from "./card-scan/styles";

const SCAN_INTERVAL_MS = 1500;

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

  const [side, setSide] = useState<ScanSide>("front");
  const sideRef = useRef<ScanSide>("front");
  const [scan, setScan] = useState<ScanState>(() => initialScanState());
  const scanRef = useRef<ScanState>(scan);

  const [status, setStatus] = useState<ScanStatus>("permission");
  const statusRef = useRef<ScanStatus>("permission");
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);
  const sweep = useRef(new Animated.Value(0)).current;

  const setStatusBoth = useCallback((next: ScanStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const commit = useCallback((next: ScanState) => {
    scanRef.current = next;
    setScan(next);
  }, []);

  // Permissions ---------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    cancelledRef.current = false;
    if (!permission) return;
    if (permission.granted) {
      setStatusBoth("scanning");
    } else if (permission.canAskAgain) {
      requestPermission().then((p) => setStatusBoth(p.granted ? "scanning" : "permission"));
    } else {
      setStatusBoth("permission");
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [visible, permission, requestPermission, setStatusBoth]);

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    commit(initialScanState());
    sideRef.current = "front";
    setSide("front");
    setErrMsg("");
  }, [visible, commit]);

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

  const switchSide = useCallback(
    (next: ScanSide) => {
      sideRef.current = next;
      setSide(next);
      commit(resetHits(scanRef.current));
    },
    [commit],
  );

  const persist = useCallback(
    async (state: ScanState) => {
      if (!state.acc.number) return;
      setStatusBoth("saving");
      const next = await mergePass({
        number: state.acc.number,
        holder: state.acc.holder ?? undefined,
        validUntil: state.acc.validUntil ?? undefined,
        lastScanAt: Date.now(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatusBoth("done");
      onCaptured?.(next);
      setTimeout(onClose, 700);
    },
    [onCaptured, onClose, setStatusBoth],
  );

  const apply = useCallback(
    async (out: ScanIngest) => {
      commit(out.state);
      if (out.promoted) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (out.nextSide !== sideRef.current) {
        sideRef.current = out.nextSide;
        setSide(out.nextSide);
      }
      if (out.complete) await persist(out.state);
    },
    [commit, persist],
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
      if (result.confidence >= 0.6) {
        await apply(ingestScanFields(scanRef.current, sideRef.current, result));
      }
    } catch (e) {
      setErrMsg((e as Error).message ?? "Capture failed");
    } finally {
      setBusy(false);
    }
  }, [busy, apply]);

  // Auto-capture loop
  useEffect(() => {
    if (!visible || status !== "scanning") return;
    let alive = true;
    const tick = async () => {
      while (alive && !cancelledRef.current && statusRef.current === "scanning") {
        await captureFrame();
        await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [visible, status, captureFrame]);

  const sweepY = sweep.interpolate({ inputRange: [0, 1], outputRange: [4, 220] });

  const statusText =
    status === "permission"
      ? "Awaiting camera access"
      : status === "scanning"
        ? busy
          ? "Reading…"
          : sideHint(side)
        : status === "saving"
          ? "Saving"
          : status === "done"
            ? "Captured"
            : errMsg || "Camera unavailable";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[s.root, { paddingTop: insets.top + 14 }]}>
        <View style={s.header}>
          <Text style={s.eyebrow}>Scan your Motion card</Text>
          <Pressable
            onPress={() => {
              cancelledRef.current = true;
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            hitSlop={12}
            style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.closeGlyph}>×</Text>
          </Pressable>
        </View>

        <View style={s.toggle}>
          {(["front", "back"] as const).map((sideKey) => {
            const active = side === sideKey;
            const done = sideKey === "front" ? scan.frontDone : scan.backDone;
            return (
              <Pressable
                key={sideKey}
                onPress={() => switchSide(sideKey)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[s.toggleBtn, active && s.toggleBtnActive]}
              >
                <Text style={[s.toggleLabel, active && s.toggleLabelActive]}>
                  {sideKey}
                  {done ? "  ✓" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScanViewport
          ref={cameraRef}
          granted={!!permission?.granted}
          status={status}
          statusText={statusText}
          sweepY={sweepY}
          onRequestPermission={() =>
            requestPermission().then((p) => p.granted && setStatusBoth("scanning"))
          }
        />

        <ScanReadout state={scan} />

        <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Pressable
            onPress={captureFrame}
            disabled={status !== "scanning" || busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              s.primaryBtn,
              (pressed || busy) && { opacity: 0.75 },
              status !== "scanning" && { opacity: 0.4 },
            ]}
          >
            <Text style={s.primaryBtnLabel}>{busy ? "Reading" : "Capture now"}</Text>
          </Pressable>
          <Pressable
            onPress={() => apply(skipScanSide(scanRef.current, sideRef.current))}
            disabled={status === "saving" || status === "done"}
            accessibilityRole="button"
            style={({ pressed }) => [s.ghostBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.ghostBtnLabel}>Skip this side</Text>
          </Pressable>
          <Text style={s.footnote}>Hold steady — entire card inside the frame</Text>
        </View>
      </View>
    </Modal>
  );
}
