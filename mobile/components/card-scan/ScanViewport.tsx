// Live camera viewport for the Motion-card scanner: permission panel, the
// card-shaped bracket frame with its sweeping laser line, and the status badge.

import { forwardRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView } from "expo-camera";
import { scanStyles as s } from "./styles";

export type ScanStatus =
  | "permission"
  | "ready"
  | "scanning"
  | "saving"
  | "done"
  | "error";

export const ScanViewport = forwardRef<
  CameraView,
  {
    granted: boolean;
    status: ScanStatus;
    statusText: string;
    sweepY: Animated.AnimatedInterpolation<number>;
    onRequestPermission: () => void;
  }
>(function ScanViewport(
  { granted, status, statusText, sweepY, onRequestPermission },
  cameraRef,
) {
  return (
    <View style={s.viewport}>
      {granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          ratio="16:9"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.permissionPanel]}>
          <Text style={s.permissionTitle}>Camera access needed</Text>
          <Text style={s.permissionBody}>
            Aloya only opens the camera while you&apos;re scanning your card. No
            images are stored.
          </Text>
          <Pressable
            onPress={onRequestPermission}
            accessibilityRole="button"
            style={({ pressed }) => [s.permissionBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={s.permissionBtnLabel}>Allow camera</Text>
          </Pressable>
        </View>
      )}

      {granted && (
        <View pointerEvents="none" style={s.frameWrap}>
          <View style={s.frame}>
            {(["tl", "tr", "bl", "br"] as const).map((p) => (
              <View
                key={p}
                style={[
                  s.corner,
                  p === "tl" && { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
                  p === "tr" && { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
                  p === "bl" && { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
                  p === "br" && { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
                ]}
              />
            ))}
            {status === "scanning" && (
              <Animated.View style={[s.sweep, { transform: [{ translateY: sweepY }] }]} />
            )}
          </View>
        </View>
      )}

      <View style={s.statusBadge} pointerEvents="none">
        <Text style={s.statusText} numberOfLines={2}>
          {statusText}
        </Text>
      </View>
    </View>
  );
});
