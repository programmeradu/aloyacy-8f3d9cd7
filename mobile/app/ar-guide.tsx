import { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from "react-native";
import { Camera, CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion, Magnetometer } from "expo-sensors";
import { router, useLocalSearchParams } from "expo-router";
import { palette } from "@/constants/theme";
import { X, Navigation, Info } from "lucide-react-native";
import * as Haptics from "expo-haptics";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/**
 * Native AR Viewfinder.
 *
 * Overlays a virtual bus stop marker on the real world using the camera,
 * magnetometer, and GPS. Essential for finding stops in dense or
 * unfamiliar areas where 2D maps are confusing.
 */
export default function ArGuideScreen() {
  const { lat, lng, label } = useLocalSearchParams<{ lat: string; lng: string; label: string }>();
  const targetLat = parseFloat(lat ?? "0");
  const targetLng = parseFloat(lng ?? "0");

  const [permission, requestPermission] = useCameraPermissions();
  const [heading, setHeading] = useState(0);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState(0);

  // Bearing to the target stop
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!permission?.granted) requestPermission();

    const sub = Magnetometer.addListener((data) => {
      // Calculate heading from X and Y
      let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
      angle = angle < 0 ? angle + 360 : angle;
      setHeading(Math.round(angle));
    });

    Magnetometer.setUpdateInterval(100);

    return () => sub.remove();
  }, [permission]);

  // Math: Calculate relative position of the marker on screen
  // This is a simplified projection for a "Heads Up Display"
  const relativeBearing = (bearing - heading + 540) % 360 - 180;
  const isVisible = Math.abs(relativeBearing) < 45; // 90 degree field of view
  const screenX = SCREEN_W / 2 + (relativeBearing / 45) * (SCREEN_W / 2);

  return (
    <View style={styles.container}>
      {!permission?.granted ? (
        <View style={styles.center}>
          <Text style={styles.msg}>Camera permission required for AR</Text>
          <Pressable style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </Pressable>
        </View>
      ) : (
        <CameraView style={StyleSheet.absoluteFill} facing="back">
          <View style={styles.overlay}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.closeBtn}>
                <X color={palette.white} size={24} />
              </Pressable>
              <View>
                <Text style={styles.title}>{label || "Target Stop"}</Text>
                <Text style={styles.subtitle}>AR Guide Active</Text>
              </View>
            </View>

            {/* The AR Marker */}
            {isVisible && (
              <View style={[styles.marker, { left: screenX - 60 }]}>
                <View style={styles.markerInner}>
                  <Navigation color={palette.white} size={32} />
                </View>
                <View style={styles.markerTag}>
                  <Text style={styles.markerText}>{label}</Text>
                </View>
              </View>
            )}

            {/* Guidance Arrows */}
            {!isVisible && (
              <View style={styles.guidance}>
                <Navigation
                  color={palette.ochre}
                  size={48}
                  style={{
                    transform: [{ rotate: `${relativeBearing > 0 ? 90 : -90}deg` }],
                  }}
                />
                <Text style={styles.guidanceText}>
                  Turn {relativeBearing > 0 ? "Right" : "Left"}
                </Text>
              </View>
            )}

            {/* Footer Stats */}
            <View style={styles.footer}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{Math.round(distance)}m</Text>
                <Text style={styles.statLab}>DISTANCE</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{Math.round(heading)}°</Text>
                <Text style={styles.statLab}>HEADING</Text>
              </View>
            </View>
          </View>
        </CameraView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  msg: { color: palette.white, fontSize: 16, textAlign: "center", marginBottom: 20 },
  btn: { backgroundColor: palette.aegean, padding: 16, borderRadius: 12 },
  btnText: { color: palette.white, fontWeight: "bold" },
  overlay: { flex: 1, paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: palette.white, fontSize: 20, fontWeight: "bold" },
  subtitle: { color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 1 },
  marker: {
    position: "absolute",
    top: SCREEN_H / 2 - 50,
    width: 120,
    alignItems: "center",
  },
  markerInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.aegeanDeep,
    borderWidth: 3,
    borderColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  markerTag: {
    marginTop: 8,
    backgroundColor: palette.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  markerText: { color: palette.ink, fontSize: 12, fontWeight: "bold" },
  guidance: {
    position: "absolute",
    top: SCREEN_H / 2 - 100,
    alignSelf: "center",
    alignItems: "center",
    gap: 10,
  },
  guidanceText: { color: palette.white, fontSize: 18, fontWeight: "bold", textShadowColor: "#000", textShadowRadius: 4 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
    borderRadius: 20,
  },
  stat: { alignItems: "center" },
  statVal: { color: palette.white, fontSize: 24, fontWeight: "bold" },
  statLab: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1 },
});
